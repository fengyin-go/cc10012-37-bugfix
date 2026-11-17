<template>
  <section class="summary-panel" data-testid="module-summary-detail">
    <header class="summary-head">
      <div>
        <strong>{{ summary.name }} · 业务模块汇总结果数据明细</strong>
        <p class="summary-meta">
          生成时间：{{ summary.generatedAt }} ｜ 快照依据：{{ summary.snapshotKey }}
        </p>
      </div>
      <div class="summary-actions">
        <button class="btn" type="button" @click="toggle">{{ expanded ? '收起明细' : '查看明细' }}</button>
        <button class="btn" type="button" @click="download">下载明细文件</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">登记总量</span>
        <strong class="stat-value">{{ summary.total }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待处理</span>
        <strong class="stat-value">{{ summary.pending }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">异常量</span>
        <strong class="stat-value">{{ summary.abnormal }}</strong>
      </article>
    </div>

    <!-- 一次汇总周期内查询完成与流水线终止可能先后到达，两种时点口径都保留完整依据，冲突时对照。 -->
    <table v-if="expanded" class="data-table summary-table">
      <thead>
        <tr>
          <th>统计口径</th>
          <th>登记总量</th>
          <th>待处理</th>
          <th>异常量</th>
        </tr>
      </thead>
      <tbody>
        <tr :class="{ 'caliber-conflict': summary.conflict }">
          <td>按最新记录状态（卡片口径）</td>
          <td>{{ summary.total }}</td>
          <td>{{ summary.basis.latest.pending }}</td>
          <td>{{ summary.basis.latest.abnormal }}</td>
        </tr>
        <tr :class="{ 'caliber-conflict': summary.conflict }">
          <td>按批次关闭时点</td>
          <td>{{ summary.total }}</td>
          <td>{{ summary.basis.closeBatch.pending }}</td>
          <td>{{ summary.basis.closeBatch.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="expanded && summary.conflict" class="conflict-note">
      两种时点统计结果不一致，已按上表分别保留快照依据；页面卡片与列表导出统一使用「按最新记录状态」口径，不混用两个时点的异常量。
    </p>

    <table v-if="expanded" class="data-table summary-table">
      <thead>
        <tr>
          <th>记录编号</th>
          <th>{{ codeLabel }}</th>
          <th>当前状态</th>
          <th>待处理标记</th>
          <th>异常标记</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="record in summary.records" :key="record.id">
          <td>{{ record.id }}</td>
          <td>{{ record.code }}</td>
          <td>{{ record.status }}</td>
          <td>{{ record.pending ? '待处理' : '已完结' }}</td>
          <td :class="record.abnormal ? 'mark-abnormal' : 'mark-normal'">
            {{ record.abnormal ? '异常' : '正常' }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">合计（{{ summary.records.length }} 条记录）</td>
          <td>{{ summary.pending }}</td>
          <td>{{ summary.abnormal }}</td>
        </tr>
      </tfoot>
    </table>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { downloadModuleSummary } from '@/api/local-service'
import type { ModuleSummary } from '@/data/types'

const props = defineProps<{
  summary: ModuleSummary
  codeLabel: string
}>()

const expanded = ref(false)

function toggle() {
  expanded.value = !expanded.value
}

function download() {
  downloadModuleSummary(props.summary.key)
}
</script>

<style scoped>
.summary-panel {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.summary-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}
.summary-meta {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  word-break: break-all;
}
.summary-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.summary-table {
  margin-top: 10px;
}
.caliber-conflict {
  background: #fff7ed;
}
.conflict-note {
  margin: 8px 0 0;
  color: #b45309;
  font-size: 12px;
}
.mark-abnormal {
  color: #b42318;
  font-weight: 600;
}
.mark-normal {
  color: #067647;
}
tfoot td {
  font-weight: 600;
  background: #f8fafc;
}
</style>
