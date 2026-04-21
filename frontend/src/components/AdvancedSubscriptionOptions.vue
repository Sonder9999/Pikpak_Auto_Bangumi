<script setup lang="ts">
import { NInput, NCollapse, NCollapseItem } from 'naive-ui'

defineProps<{
  includeRule: string
  excludeRule: string
  episodeOffset: string
  ruleHint: string
}>()

const emit = defineEmits<{
  (e: 'update:includeRule', value: string): void
  (e: 'update:excludeRule', value: string): void
  (e: 'update:episodeOffset', value: string): void
}>()
</script>

<template>
  <n-collapse arrow-placement="right" class="mt-4">
    <n-collapse-item title="高级配置" name="1">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
        <div>
          <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">包含规则</span>
          <n-input :value="includeRule" placeholder="例如：1080p HEVC 或 1080p|2160p" size="small" @update:value="emit('update:includeRule', $event)" />
        </div>
        <div>
          <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">排除规则</span>
          <n-input :value="excludeRule" placeholder="例如：720p" size="small" @update:value="emit('update:excludeRule', $event)" />
        </div>
        <div>
          <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">集数偏移</span>
          <n-input :value="episodeOffset" placeholder="0" size="small" @update:value="emit('update:episodeOffset', $event)" />
        </div>
        <div class="md:col-span-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
          {{ ruleHint }}
        </div>
      </div>
    </n-collapse-item>
  </n-collapse>
</template>