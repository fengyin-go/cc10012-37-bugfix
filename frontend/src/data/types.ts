/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

/** 汇总明细里的单条记录快照：登记记录 + 状态标记，供卡片与导出复核。 */
export type SummaryRecord = {
  id: number
  code: string
  status: string
  pending: boolean
  abnormal: boolean
}

/**
 * 一次汇总周期里的两种统计口径：
 * - latest：按最新记录状态和状态标记重算（查询完成等事件到达后的口径）
 * - closeBatch：按批次关闭时点重算（流水线终止等事件先到时的口径，回退动作计入异常）
 * 两个口径各自保留完整快照依据，导出时不混用；数值不一致时 conflict 置 true 供冲突判定。
 */
export type SummaryBasis = {
  pending: number
  abnormal: number
}

/** 业务模块汇总结果数据明细：运营概览与业务列表共用同一份。 */
export type ModuleSummary = {
  key: string
  name: string
  entity: string
  total: number
  pending: number
  abnormal: number
  conflict: boolean
  basis: {
    latest: SummaryBasis
    closeBatch: SummaryBasis
  }
  generatedAt: string
  snapshotKey: string
  records: SummaryRecord[]
}

export type ActionResult = {
  ok: boolean
  message: string
  /** 动作成功后基于同一份记录快照重算的汇总明细，页面回执直接展示。 */
  summary?: ModuleSummary
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: ModuleSummary[]
  generatedAt: string
}
