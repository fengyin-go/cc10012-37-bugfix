<template>
  <section class="page" data-module="filter">
    <header class="page-head">
      <div>
        <h2>数据筛选管理</h2>
        <p class="page-desc">维护数据筛选规则的输入、执行约束与结果记录，为数据过滤提供可验证的数据工程流程。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记筛选规则</button>
        <button class="btn" type="button" @click="exportRows">导出数据筛选清单</button>
      </div>
    </header>
    <ModuleSummaryPanel :summary="summary" :code-label="columns[0]" />

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无数据筛选数据，可先登记筛选规则</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>列表条目 {{ total }} 条（全量登记 {{ summary.total }} 条，待处理 {{ summary.pending }} 条，异常 {{ summary.abnormal }} 条）</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  moduleSummary as loadModuleSummary,
  metricValue,
  runAction as applyAction,
} from '@/api/local-service'
import ModuleSummaryPanel from '@/components/ModuleSummaryPanel.vue'
import type { EntryRow, ModuleSummary } from '@/data/types'

const meta = moduleMeta('filter')
const columns = ["规则编号", "目标数据集", "筛选字段", "比较运算符", "比较值", "逻辑组合", "排序字段", "输出行数上限"]
const actions = ["提交校验", "启用规则", "停用规则"]
const statuses = ["草稿", "待校验", "已启用", "已停用"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
// 业务模块汇总结果数据明细：与表格共用同一份记录快照，检索不改变全量汇总。
const summary = ref<ModuleSummary>(loadModuleSummary(meta.key))
const stats = computed(() =>
  meta.metrics.map((label) => ({ label, value: metricValue(meta.key, label, summary.value) })),
)
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: summary.value.records.filter((row) => row.status === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  // 导出结果与当前列表条目一致：把检索条件一并传给导出。
  downloadEntries(meta.key, filters.value)
}

function openCreate() {
  errorMessage.value = '筛选规则登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    if (result.summary) {
      summary.value = result.summary
    }
    return
  }
  // 回执直接采用动作基于同一份记录快照重算出的汇总明细，刷新前后数量不会分叉。
  if (result.summary) {
    summary.value = result.summary
  }
  noticeMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    // 检索条件只影响当前表格；汇总明细始终读取模块全量记录快照。
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    summary.value = loadModuleSummary(meta.key)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '数据筛选列表读取失败'
  }
}

onMounted(reload)
</script>
