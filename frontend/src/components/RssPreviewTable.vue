<script setup lang="ts">
interface RssPreviewItem {
  title: string
  link?: string | null
  homepage?: string | null
  torrentUrl?: string | null
  sizeBytes?: number | null
  publishedAt?: string | null
}

interface RssPreviewGroup {
  groupName: string
  itemCount?: number
  items: RssPreviewItem[]
}

const props = withDefaults(defineProps<{
  groups: RssPreviewGroup[]
  totalCount?: number
  excludedCount?: number
  hasPreviewed?: boolean
  loading?: boolean
  errorMessage?: string
}>(), {
  totalCount: 0,
  excludedCount: 0,
  hasPreviewed: false,
  loading: false,
  errorMessage: ''
})

const getMatchedCount = () => {
  return props.groups.reduce((total, group) => total + group.items.length, 0)
}

const formatSize = (sizeBytes?: number | null) => {
  if (!sizeBytes || sizeBytes <= 0) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = sizeBytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = unitIndex === 0 ? 0 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

const formatPublishedAt = (publishedAt?: string | null) => {
  if (!publishedAt) {
    return '-'
  }

  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) {
    return publishedAt
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const getRowTarget = (item: RssPreviewItem) => {
  return item.homepage || item.link || item.torrentUrl || null
}
</script>

<template>
  <div class="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700/50 dark:bg-zinc-900/50">
    <div class="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div class="text-xs font-medium text-gray-700 dark:text-gray-200">RSS 预览</div>
      <div v-if="loading || hasPreviewed || errorMessage" class="flex items-center gap-2 text-[11px]">
        <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-300">命中 {{ getMatchedCount() }}</span>
        <span v-if="hasPreviewed && excludedCount > 0" class="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-300">排除 {{ excludedCount }}</span>
        <span v-if="hasPreviewed && totalCount > 0" class="text-gray-500 dark:text-gray-400">总计 {{ totalCount }}</span>
      </div>
    </div>

    <div v-if="loading" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
      正在读取 RSS 并应用规则...
    </div>
    <div v-else-if="errorMessage" class="px-4 py-6 text-center text-xs text-red-500 dark:text-red-300">
      {{ errorMessage }}
    </div>
    <div v-else-if="!hasPreviewed" class="px-4 py-4 text-xs leading-6 text-gray-500 dark:text-gray-400">
      支持空格、&、&& 作为多个关键词同时命中；使用 |、.* 或 /.../ 时按原生正则处理
    </div>
    <div v-else-if="groups.length === 0" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
      当前规则未命中任何条目
    </div>
    <div v-else class="divide-y divide-zinc-200 dark:divide-zinc-800">
      <section v-for="group in groups" :key="group.groupName" class="px-2 py-2">
        <div class="flex items-center justify-between px-1 pb-2 text-xs">
          <div class="font-medium text-gray-700 dark:text-gray-200">{{ group.groupName }}</div>
          <div class="text-gray-500 dark:text-gray-400">{{ group.itemCount ?? group.items.length }} 条</div>
        </div>
        <div class="max-h-56 overflow-y-auto custom-scrollbar text-xs">
          <table class="w-full text-left">
            <thead class="text-gray-400 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th class="py-1.5 font-medium">番组名</th>
                <th class="py-1.5 font-medium w-16 text-center">大小</th>
                <th class="py-1.5 font-medium w-24 text-right">更新时间</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr v-for="(item, index) in group.items" :key="`${group.groupName}-${item.title}-${index}`" class="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <td class="py-1.5 pr-2 max-w-[200px] truncate" :title="item.title">
                  <a
                    v-if="getRowTarget(item)"
                    :href="getRowTarget(item) || undefined"
                    target="_blank"
                    rel="noreferrer"
                    class="block truncate text-gray-700 hover:text-blue-600 dark:text-gray-200 dark:hover:text-blue-300"
                  >
                    {{ item.title }}
                  </a>
                  <span v-else class="block truncate text-gray-700 dark:text-gray-200">{{ item.title }}</span>
                </td>
                <td class="py-1.5 text-center text-gray-500">{{ formatSize(item.sizeBytes) }}</td>
                <td class="py-1.5 text-right text-gray-500">{{ formatPublishedAt(item.publishedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #4b5563;
  border-radius: 4px;
}
</style>