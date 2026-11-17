import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  EntryRow,
  ModuleMeta,
  ModuleSummary,
  OverviewResult,
  PageResult,
  SummaryBasis,
  SummaryRecord,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 批次关闭时点口径下，视为「提前终止/回退」的目标状态：流水线或任务在批次关闭前被终止，计入异常。
const CLOSE_BATCH_ABNORMAL_STATUSES = ['已超时', '已失败', '已失效', '已断开', '已下线', '已停用', '已废弃']

// 一次汇总周期内只允许一份汇总明细在写。localStorage 本身是同步写入，
// 这里再保留一道在途标记：并发重试或状态回退命中时直接复用当前周期的结果，
// 保证竞态重试只生成一份业务模块汇总结果数据明细，不会出现两份明细互相覆盖导致结果丢失。
let summaryWriteInFlight = false

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  // 检索条件只影响当前表格：筛选在列表层做，汇总始终读取模块全量记录快照。
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

function isNegativeTarget(meta: ModuleMeta, target: string): boolean {
  if (CLOSE_BATCH_ABNORMAL_STATUSES.includes(target)) {
    return true
  }
  return meta.actions.some((action) => {
    return meta.actionTargets[action] === target && NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
  })
}

/**
 * 基于一份确定的记录快照重算业务模块汇总结果数据明细。
 * 两种口径都从同一份快照取数，各自独立统计，导出时只取其中一种，不混用两个时点的异常量。
 */
export function buildModuleSummary(meta: ModuleMeta, snapshot: EntryRow[]): ModuleSummary {
  const records: SummaryRecord[] = snapshot.map((row) => ({
    id: Number(row.id),
    code: String(row[meta.fields[0]] ?? row.id),
    status: String(row.status),
    pending: Boolean(row.pending),
    abnormal: Boolean(row.abnormal),
  }))

  // 口径一：按最新记录状态和状态标记重算（查询完成事件到达后的当前口径，页面卡片以此为准）。
  const latest: SummaryBasis = {
    pending: records.filter((row) => row.pending).length,
    abnormal: records.filter((row) => row.abnormal).length,
  }

  // 口径二：按批次关闭时点重算（流水线终止等事件先到时的口径）。
  // 关闭时点仍未走到终态的记录算待处理；终止/回退类终态在关闭时点计入异常。
  const closeBatch: SummaryBasis = {
    pending: records.filter((row) => row.pending).length,
    abnormal: records.filter(
      (row) => row.abnormal || isNegativeTarget(meta, row.status),
    ).length,
  }

  const now = new Date()
  return {
    key: meta.key,
    name: meta.name,
    entity: meta.entity,
    total: records.length,
    pending: latest.pending,
    abnormal: latest.abnormal,
    conflict: latest.pending !== closeBatch.pending || latest.abnormal !== closeBatch.abnormal,
    basis: { latest, closeBatch },
    generatedAt: now.toISOString(),
    // 快照依据：模块键 + 记录数 + 各记录状态标记指纹，刷新后可复核这份明细对应哪份记录。
    snapshotKey: `${meta.key}:${records
      .map((row) => `${row.id}@${row.status}/${row.pending ? 'P' : '-'}${row.abnormal ? 'A' : '-'}`)
      .join('|')}`,
    records,
  }
}

/** 读取业务模块记录和状态标记数据，按当前记录重算登记总量、待处理和异常量。 */
export function moduleSummary(key: string): ModuleSummary {
  const meta = moduleMeta(key)
  return buildModuleSummary(meta, listRows(key))
}

/**
 * 模块页指标卡统一从汇总明细读数：
 * 「总数」类指标取登记总量，其余指标按标签里携带的状态名回落到明细记录统计，
 * 保证指标卡与运营概览、表尾条数来自同一份业务模块汇总结果数据明细。
 */
export function metricValue(key: string, label: string, summary: ModuleSummary): number {
  if (label.includes('总数')) {
    return summary.total
  }
  const meta = moduleMeta(key)
  const matchedStatus = meta.statuses.find((status) => label.includes(status))
  if (matchedStatus) {
    return summary.records.filter((row) => row.status === matchedStatus).length
  }
  if (label.includes('待')) {
    return summary.pending
  }
  return summary.abnormal
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  // 并发重试或状态回退时只保留一份汇总明细：在途周期内直接返回当前快照的重算结果，
  // 不再二次写库，避免两份明细竞争写入把结果覆盖丢失。
  if (summaryWriteInFlight) {
    const current = moduleSummary(key)
    return {
      ok: true,
      message: `${meta.entity}动作仍在处理中，已保留当前汇总明细：总量 ${current.total}、待处理 ${current.pending}、异常 ${current.abnormal}`,
      summary: current,
    }
  }
  summaryWriteInFlight = true
  try {
    // 状态更新与汇总读取基于同一份记录快照：先取快照，在快照上改，再整体写回。
    const rows = listRows(key)
    const index = rows.findIndex((row) => Number(row.id) === id)
    if (index < 0) {
      return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
    }
    const current = String(rows[index].status)
    if (current === target) {
      return {
        ok: false,
        message: `${meta.entity}已经是「${target}」，不用重复操作`,
        summary: buildModuleSummary(meta, rows),
      }
    }
    const lastStatus = meta.statuses[meta.statuses.length - 1]
    const updated: EntryRow = {
      ...rows[index],
      status: target,
      pending: target !== lastStatus,
      abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
    }
    const next = [...rows]
    next[index] = updated
    saveRows(key, next)
    // 写库后立刻基于写回的同一份记录快照重算，运营概览与业务列表刷新前后数量保持一致。
    const summary = buildModuleSummary(meta, next)
    return {
      ok: true,
      message: `${meta.entity}已${action}，当前状态「${target}」；汇总：总量 ${summary.total}、待处理 ${summary.pending}、异常 ${summary.abnormal}`,
      summary,
    }
  } finally {
    summaryWriteInFlight = false
  }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 导出结果与列表条目一致：导出当前检索后的表格条目，而不是模块全量。 */
export function exportEntries(
  key: string,
  filters: Record<string, string> = {},
): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态', '待处理标记', '异常标记']
  const lines = [header.join(',')]
  const items = filterRows(listRows(key), filters)
  for (const row of items) {
    lines.push(
      [
        row.id,
        ...meta.fields.map((field) => escapeCsvCell(row[field] ?? '')),
        row.status,
        row.pending ? '待处理' : '已完结',
        row.abnormal ? '异常' : '正常',
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string, filters: Record<string, string> = {}): void {
  const { filename, content } = exportEntries(key, filters)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * 业务模块汇总结果数据明细形成可下载文件。
 * 两个时点的口径分区块输出、各自带快照依据，异常量不跨口径混用，冲突时可直接对照两种做法。
 */
export function exportModuleSummary(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const summary = moduleSummary(key)
  const lines: string[] = []
  lines.push(['模块', summary.name].join(','))
  lines.push(['明细生成时间', summary.generatedAt].join(','))
  lines.push(['快照依据', escapeCsvCell(summary.snapshotKey)].join(','))
  lines.push(['口径冲突', summary.conflict ? '是（两种时点统计不一致，请对照下方口径）' : '否'].join(','))
  lines.push('')
  lines.push(['统计口径', '登记总量', '待处理', '异常量'].join(','))
  lines.push(
    ['按最新记录状态（页面卡片口径）', summary.total, summary.basis.latest.pending, summary.basis.latest.abnormal]
      .map(escapeCsvCell)
      .join(','),
  )
  lines.push(
    ['按批次关闭时点', summary.total, summary.basis.closeBatch.pending, summary.basis.closeBatch.abnormal]
      .map(escapeCsvCell)
      .join(','),
  )
  lines.push('')
  lines.push(['记录编号', '业务编号', '当前状态', '待处理标记', '异常标记'].join(','))
  for (const record of summary.records) {
    lines.push(
      [
        record.id,
        record.code,
        record.status,
        record.pending ? '待处理' : '已完结',
        record.abnormal ? '异常' : '正常',
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return { filename: `${meta.name}-汇总结果明细.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadModuleSummary(key: string): void {
  const { filename, content } = exportModuleSummary(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** 运营概览：所有模块在同一个汇总周期内基于各自全量记录快照重算，卡片通过模块汇总核对。 */
export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) =>
    buildModuleSummary(meta, rows[meta.key] ?? []),
  )
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.total, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules, generatedAt: new Date().toISOString() }
}
