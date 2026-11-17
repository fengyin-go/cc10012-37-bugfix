<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常；卡片数量由各模块汇总明细核对而来。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <!-- 概览页面列出业务模块汇总结果数据明细，点击行即可展开明细视图。 -->
    <table class="data-table">
      <thead>
        <tr>
          <th>业务模块</th>
          <th>登记总量</th>
          <th>待处理</th>
          <th>异常量（最新状态口径）</th>
          <th>异常量（批次关闭时点）</th>
          <th>口径冲突</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.key" :class="{ 'row-selected': row.key === selectedKey }">
          <td>{{ row.name }}</td>
          <td>{{ row.total }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
          <td>{{ row.basis.closeBatch.abnormal }}</td>
          <td>
            <span v-if="row.conflict" class="conflict-tag">冲突，待核对</span>
            <span v-else class="ok-tag">一致</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="toggleDetail(row.key)">
              {{ row.key === selectedKey ? '收起明细' : '查看明细' }}
            </button>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>合计（{{ moduleRows.length }} 个业务模块）</td>
          <td>{{ cards[1]?.value }}</td>
          <td>{{ cards[2]?.value }}</td>
          <td>{{ cards[3]?.value }}</td>
          <td>{{ closeBatchAbnormalTotal }}</td>
          <td>—</td>
          <td>—</td>
        </tr>
      </tfoot>
    </table>

    <ModuleSummaryPanel
      v-if="selected"
      :summary="selected"
      :code-label="codeLabelOf(selected.key)"
    />

    <footer class="page-foot">
      <span>最近一次汇总：{{ generatedAt }} ｜ 数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadOverview, moduleMeta } from '@/api/local-service'
import ModuleSummaryPanel from '@/components/ModuleSummaryPanel.vue'
import type { ModuleSummary, OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<ModuleSummary[]>([])
const generatedAt = ref('')
const selectedKey = ref<string | null>(null)

const selected = computed(() => moduleRows.value.find((row) => row.key === selectedKey.value) ?? null)
const closeBatchAbnormalTotal = computed(() =>
  moduleRows.value.reduce((sum, row) => sum + row.basis.closeBatch.abnormal, 0),
)

function codeLabelOf(key: string): string {
  return moduleMeta(key).fields[0]
}

function toggleDetail(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  generatedAt.value = payload.generatedAt
  if (selectedKey.value && !payload.modules.some((row) => row.key === selectedKey.value)) {
    selectedKey.value = null
  }
}

onMounted(refresh)
</script>

<style scoped>
tfoot td {
  font-weight: 600;
  background: #f8fafc;
}
.row-selected {
  background: #eff6ff;
}
.conflict-tag {
  color: #b45309;
  font-weight: 600;
}
.ok-tag {
  color: #067647;
}
</style>
