<script setup lang="ts">
import { NButton, NInput } from 'naive-ui'
import RssPreviewTable from './RssPreviewTable.vue'

interface RssPreviewItem {
  title: string
  link: string | null
  homepage: string | null
  magnetUrl: string | null
  torrentUrl: string | null
  sizeBytes: number | null
  publishedAt: string | null
}

interface RssPreviewGroup {
  groupName: string
  itemCount?: number
  items: RssPreviewItem[]
}

defineProps<{
  url: string
  includeRule: string
  excludeRule: string
  ruleHint: string
  isValidUrl: boolean
  buttonLabel: string
  saving: boolean
  previewing: boolean
  hasPreviewed: boolean
  previewTotal: number
  previewExcludedCount: number
  previewError: string
  previewGroups: RssPreviewGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:url', value: string): void
  (e: 'update:includeRule', value: string): void
  (e: 'update:excludeRule', value: string): void
  (e: 'preview'): void
  (e: 'save'): void
}>()
</script>

<template>
  <div class="flex flex-col gap-3 pt-1">
    <div>
      <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">RSS 订阅地址 <span class="text-red-400">*</span></span>
      <n-input
        :value="url"
        placeholder="https://mikanani.me/RSS/Bangumi?..."
        :status="url && !isValidUrl ? 'error' : undefined"
        @update:value="emit('update:url', $event)"
      />
      <span v-if="url && !isValidUrl" class="text-xs text-red-400 mt-1 block">请输入有效的 RSS URL（http:// 或 https://）</span>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">包含规则（可选）</span>
        <n-input :value="includeRule" placeholder="例如：黒ネズミたち CR 或 /CR\s1920x1080/" size="small" @update:value="emit('update:includeRule', $event)" />
      </div>
      <div>
        <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">排除规则（可选）</span>
        <n-input :value="excludeRule" placeholder="例如：720p" size="small" @update:value="emit('update:excludeRule', $event)" />
      </div>
    </div>

    <div class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
      {{ ruleHint }}
    </div>

    <div v-if="url && isValidUrl" class="mt-1">
      <RssPreviewTable
        :groups="previewGroups"
        :total-count="previewTotal"
        :excluded-count="previewExcludedCount"
        :has-previewed="hasPreviewed"
        :loading="previewing"
        :error-message="previewError"
      />
    </div>

    <div class="grid grid-cols-2 gap-3 mt-2">
      <n-button
        type="default"
        ghost
        :disabled="!isValidUrl"
        :loading="previewing"
        @click="emit('preview')"
      >
        预览匹配结果
      </n-button>
      <n-button
        type="primary"
        :disabled="!isValidUrl"
        :loading="saving"
        @click="emit('save')"
      >
        {{ buttonLabel }}
      </n-button>
    </div>
  </div>
</template>