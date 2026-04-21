<script setup lang="ts">
import { ref, watch } from 'vue'
import { NDrawer, NDrawerContent, NButton, NIcon, NSpin, NEmpty, NTag, NInput, NCollapse, NCollapseItem } from 'naive-ui'
import { OpenOutline, SearchOutline, CheckmarkCircleOutline, ListOutline } from '@vicons/ionicons5'
import { searchMikan, getMikanBangumi } from '../api'

const props = defineProps<{
  show: boolean
  bangumi: any
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'subscribed'): void
}>()

const handleClose = () => {
  emit('update:show', false)
}

// Mikan Search State
const searchQuery = ref('')
const MikanResults = ref<any[]>([])
const loadingSearch = ref(false)
const selectedMikanId = ref<string | null>(null)

// Mikan Detail State
const loadingDetail = ref(false)
const subtitleGroups = ref<any[]>([])
const selectedSubgroup = ref<string | null>(null)

// Advanced config
const regexInclude = ref('')
const regexExclude = ref('')
const episodeOffset = ref('0')

// Manual RSS state
const manualRssUrl = ref('')
const manualRssInclude = ref('')
const manualRssExclude = ref('')
const savingManualRss = ref(false)

const isValidUrl = (url: string) => {
  return url.startsWith('http://') || url.startsWith('https://')
}

const saveManualRss = async () => {
  if (!isValidUrl(manualRssUrl.value) || !props.bangumi?.id) return
  savingManualRss.value = true
  try {
    const payload = {
      bangumiId: props.bangumi.id,
      rssUrl: manualRssUrl.value,
      regexInclude: manualRssInclude.value || undefined,
      regexExclude: manualRssExclude.value || undefined,
    }
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      emit('subscribed')
      handleClose()
    }
  } catch (e) {
    console.error('Manual RSS subscription failed', e)
  } finally {
    savingManualRss.value = false
  }
}

watch(() => props.show, (newVal) => {
  if (newVal && props.bangumi) {
    searchQuery.value = props.bangumi.nameCn || props.bangumi.name
    MikanResults.value = []
    selectedMikanId.value = null
    subtitleGroups.value = []
    selectedSubgroup.value = null
    manualRssUrl.value = ''
    manualRssInclude.value = ''
    manualRssExclude.value = ''

    // Auto trigger search
    handleSearch()
  }
})

const handleSearch = async () => {
  if (!searchQuery.value) return
  loadingSearch.value = true
  try {
    const res = await searchMikan(searchQuery.value)
    MikanResults.value = res.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loadingSearch.value = false
  }
}

const selectMikanBangumi = async (mikanId: string | number) => {
  selectedMikanId.value = mikanId.toString()
  loadingDetail.value = true
  try {
    const res = await getMikanBangumi(Number(mikanId))
    subtitleGroups.value = res.data?.subgroups || []
  } catch (e) {
    console.error(e)
  } finally {
    loadingDetail.value = false
  }
}

const subscribe = async () => {
  if (!selectedSubgroup.value || !selectedMikanId.value) return
  try {
    const targetSubgroup = subtitleGroups.value.find(s => s.name === selectedSubgroup.value)
    const rssUrl = targetSubgroup?.rssUrl || ''

    const payload = {
      bangumiId: props.bangumi.id,
      mikanId: selectedMikanId.value,
      subgroupName: selectedSubgroup.value,
      rssUrl,
      regexInclude: regexInclude.value,
      regexExclude: regexExclude.value,
      episodeOffset: parseInt(episodeOffset.value, 10) || 0
    }

    // Call /api/subscriptions
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (res.ok) {
      emit('subscribed')
      handleClose()
    }
  } catch (e) {
    console.error('Subscription failed', e)
  }
}
</script>

<template>
  <n-drawer :show="props.show" @update:show="handleClose" width="80%" placement="right" resizable>
    <n-drawer-content :title="bangumi?.nameCn || bangumi?.name || '番剧详情'" closable>
      <div v-if="bangumi" class="flex flex-col lg:flex-row gap-6">
        <!-- Left Side: Poster & Info -->
        <div class="lg:w-1/3 flex flex-col gap-4">
          <img
            :src="bangumi.images?.large || bangumi.images?.common"
            class="w-full rounded-xl shadow-lg border border-zinc-700/50"
            alt="Poster"
          />
          <div>
            <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100">{{ bangumi.nameCn || bangumi.name }}</h2>
            <p v-if="bangumi.nameCn && bangumi.nameCn !== bangumi.name" class="text-gray-500 dark:text-gray-400 text-sm mt-1">{{ bangumi.name }}</p>
          </div>
          <div class="flex gap-2 text-sm text-gray-300">
            <n-tag v-if="bangumi.rating?.score" type="warning" round :bordered="false" size="small">
              ★ {{ bangumi.rating.score }}
            </n-tag>
            <n-tag type="default" round size="small">
              {{ bangumi.date || bangumi.year || '未知放送日期' }}
            </n-tag>
          </div>
          <div class="text-sm text-zinc-600 dark:text-gray-400 leading-relaxed max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            {{ bangumi.summary || bangumi.short_summary || '暂无简介' }}
          </div>
          <div class="flex gap-3 mt-2">
            <a
              :href="`https://bgm.tv/subject/${bangumi.id}`"
              target="_blank"
              class="flex items-center justify-center gap-1.5 flex-1 p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <n-icon><OpenOutline /></n-icon> Bangumi
            </a>
          </div>
        </div>

        <!-- Right Side: Mikan Search & Subgroups -->
        <div class="lg:w-2/3 flex flex-col gap-6">
          <!-- Step 1: Mikan Search -->
          <div class="bg-zinc-100 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
            <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <n-icon><SearchOutline /></n-icon> 匹配 Mikan Project
            </h3>
            <div class="flex gap-2 mb-4">
              <n-input v-model:value="searchQuery" placeholder="搜索番剧名称..." @keyup.enter="handleSearch" />
              <n-button type="primary" @click="handleSearch" :loading="loadingSearch">搜索</n-button>
            </div>

            <div class="min-h-[120px]">
              <n-spin :show="loadingSearch">
                <div v-if="MikanResults.length" class="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div
                    v-for="r in MikanResults"
                    :key="r.mikanId"
                    class="group relative flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all hover:border-blue-500/50 hover:bg-blue-500/10"
                    :class="(selectedMikanId === r.mikanId.toString()) ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-300 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80'"
                    @click="selectMikanBangumi(r.mikanId)"
                  >
                    <img v-if="r.image || r.posterUrl" :src="r.image ? `https://mikanani.me${r.image}` : r.posterUrl" class="w-12 h-16 object-cover rounded shadow-sm" />
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-200 line-clamp-2 leading-tight flex-1">
                      {{ r.name || r.title }}
                    </span>
                    <n-icon v-if="selectedMikanId === r.mikanId.toString()" class="text-blue-500 text-lg absolute -top-2 -right-2 bg-white dark:bg-zinc-900 rounded-full">
                      <CheckmarkCircleOutline />
                    </n-icon>
                  </div>
                </div>
                <n-empty v-else-if="!loadingSearch && searchQuery" description="暂无搜索结果" />
              </n-spin>
            </div>
          </div>

          <!-- Step 2: Subtitle Groups Selection -->
          <div v-if="selectedMikanId" class="bg-zinc-100 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
            <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <n-icon><ListOutline /></n-icon> 选择字幕组订阅
            </h3>

            <n-spin :show="loadingDetail" class="min-h-[100px]">
              <div v-if="subtitleGroups.length" class="flex flex-col gap-3">
                <template v-for="sub in subtitleGroups" :key="sub.name">
                  <div
                    class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:bg-zinc-200 dark:hover:bg-zinc-700/40"
                    :class="selectedSubgroup === sub.name ? 'border-green-500/80 bg-green-500/10' : 'border-zinc-300 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80'"
                    @click="selectedSubgroup = sub.name"
                  >
                    <div class="flex items-center gap-3">
                      <n-tag type="success" :bordered="false" size="small">{{ sub.name }}</n-tag>
                      <span class="text-xs text-gray-500 dark:text-gray-400">发现 {{ sub.episodes?.length || 0 }} 个资源</span>
                    </div>
                    <n-icon v-if="selectedSubgroup === sub.name" class="text-green-500 text-xl">
                      <CheckmarkCircleOutline />
                    </n-icon>
                  </div>

                  <!-- Expanded Subgroup Episodes -->
                  <div v-if="selectedSubgroup === sub.name" class="px-2 py-1 mb-2 bg-white dark:bg-zinc-900/50 rounded-lg max-h-56 overflow-y-auto custom-scrollbar text-xs border border-zinc-200 dark:border-zinc-700/50">
                    <table class="w-full text-left">
                      <thead class="text-gray-400 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          <th class="py-1.5 font-medium">番组名</th>
                          <th class="py-1.5 font-medium w-16 text-center">大小</th>
                          <th class="py-1.5 font-medium w-24 text-right">更新时间</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                        <tr v-for="(ep, i) in sub.episodes" :key="i" class="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                          <td class="py-1.5 pr-2 max-w-[200px] truncate" :title="ep.title">{{ ep.title }}</td>
                          <td class="py-1.5 text-center text-gray-500">{{ ep.size }}</td>
                          <td class="py-1.5 text-right text-gray-500">{{ ep.updatedAt }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>

                <!-- Advanced Options -->
                <n-collapse arrow-placement="right" class="mt-4">
                  <n-collapse-item title="高级配置" name="1">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                      <div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">包含正则</span>
                        <n-input v-model:value="regexInclude" placeholder="例如：1080p" size="small" />
                      </div>
                      <div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">排除正则</span>
                        <n-input v-model:value="regexExclude" placeholder="例如：720p" size="small" />
                      </div>
                      <div>
                        <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">集数偏移</span>
                        <n-input v-model:value="episodeOffset" placeholder="0" size="small" />
                      </div>
                    </div>
                  </n-collapse-item>
                </n-collapse>

                <n-button
                  type="success"
                  block
                  size="large"
                  class="mt-4 shadow-lg shadow-green-900/20"
                  :disabled="!selectedSubgroup"
                  @click="subscribe"
                >
                  确认订阅 {{ bangumi.nameCn || bangumi.name }}
                </n-button>
              </div>
              <n-empty v-else-if="!loadingDetail" description="该番剧无字幕组信息" />
            </n-spin>
          </div>

          <!-- Manual RSS Input -->
          <n-collapse arrow-placement="right">
            <n-collapse-item title="手动输入 RSS" name="manual-rss">
              <div class="flex flex-col gap-3 pt-1">
                <div>
                  <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">RSS 订阅地址 <span class="text-red-400">*</span></span>
                  <n-input
                    v-model:value="manualRssUrl"
                    placeholder="https://mikanani.me/RSS/Bangumi?..."
                    :status="manualRssUrl && !isValidUrl(manualRssUrl) ? 'error' : undefined"
                  />
                  <span v-if="manualRssUrl && !isValidUrl(manualRssUrl)" class="text-xs text-red-400 mt-1 block">请输入有效的 RSS URL（http:// 或 https://）</span>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">包含正则（可选）</span>
                    <n-input v-model:value="manualRssInclude" placeholder="例如：1080p" size="small" />
                  </div>
                  <div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">排除正则（可选）</span>
                    <n-input v-model:value="manualRssExclude" placeholder="例如：720p" size="small" />
                  </div>
                </div>
                <n-button
                  type="primary"
                  block
                  :disabled="!isValidUrl(manualRssUrl)"
                  :loading="savingManualRss"
                  @click="saveManualRss"
                >
                  保存订阅
                </n-button>
              </div>
            </n-collapse-item>
          </n-collapse>

        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
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