<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getBangumiCollections, getConfig, getSubscriptions } from "../api";
import BangumiCard from "./BangumiCard.vue";
import { NSkeleton, NEmpty, NButton } from "naive-ui";
import { useRouter } from "vue-router";

const router = useRouter();

interface SubscriptionSource {
  bangumiId?: number | null;
  bangumiSubjectId?: number | null;
}

const loading = ref(true);
const collections = ref<any[]>([]);
const subscribedIds = ref<number[]>([]);
const isTokenConfigured = ref(true);
const activeTab = ref<number | 'subscribed'>(3); // 3 = playing by default

// Pagination
const currentPage = ref(1);
const pageSize = 30;
const total = ref(0);

const totalPages = computed(() => Math.ceil(total.value / pageSize));
const showPagination = computed(() => activeTab.value !== 'subscribed' && totalPages.value > 1);

// Detail drawer
import BangumiDetailDrawer from "./BangumiDetailDrawer.vue";
const showDrawer = ref(false);
const currentBangumi = ref<any>(null);

const handleCardClick = (bangumi: any) => {
  currentBangumi.value = bangumi;
  showDrawer.value = true;
};

const onSubscribeSuccess = () => {
  fetchData();
};

// Tabs: 1=想看, 2=看过, 3=在看
const tabs = [
  { id: 1, label: '想看' },
  { id: 3, label: '在看' },
  { id: 2, label: '看过' },
  { id: 'subscribed' as const, label: '已订阅' }
];

const fetchSubscriptions = async () => {
  try {
    const res = await getSubscriptions();
    subscribedIds.value = (res.data || [])
      .map((source: SubscriptionSource) => Number(source.bangumiSubjectId ?? source.bangumiId))
      .filter(Boolean);
  } catch (error) {
    console.error("Error fetching subscriptions", error);
  }
};

const fetchData = async () => {
  loading.value = true;
  await fetchSubscriptions();
  await fetchCollections();
  loading.value = false;
};

const fetchSettings = async () => {
  try {
    const res = await getConfig();
    const token = res.data?.bangumi?.token;
    isTokenConfigured.value = !!token;
  } catch (error) {
    console.error("Config fetch error", error);
  }
};

const fetchCollections = async () => {
  if (!isTokenConfigured.value) {
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    if (activeTab.value === 'subscribed') {
      // Load all collections with higher limit for client-side filtering
      const res = await getBangumiCollections(undefined, 0, 100);
      const allItems: any[] = res.data?.data || res.data || [];
      collections.value = allItems.filter((item: any) =>
        subscribedIds.value.includes(Number(item.subject?.id))
      );
      total.value = collections.value.length;
    } else {
      const offset = (currentPage.value - 1) * pageSize;
      const res = await getBangumiCollections(activeTab.value, offset, pageSize);
      const payload = res.data;
      if (payload && typeof payload === 'object' && 'data' in payload) {
        collections.value = payload.data || [];
        total.value = payload.total || 0;
      } else {
        // Fallback for old format
        collections.value = Array.isArray(payload) ? payload : [];
        total.value = collections.value.length;
      }
    }
  } catch (error) {
    console.error("Error fetching collections", error);
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await fetchSettings();
  fetchData();
});

const handleTabChange = (id: number | 'subscribed') => {
  activeTab.value = id;
  currentPage.value = 1;
  fetchData();
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  currentPage.value = page;
  fetchCollections();
};

// Generate page numbers with ellipsis
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
});

const navigateToSettings = () => {
  router.push('/settings');
};
</script>

<template>
  <div class="collection-board max-w-[1200px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
    <!-- Unconfigured State -->
    <div v-if="!loading && !isTokenConfigured" class="text-center py-16 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-zinc-100 dark:bg-zinc-700 rounded-full mb-6 relative">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-3">未配置 Bangumi 用户信息</h2>
      <p class="text-zinc-500 mb-6 max-w-sm mx-auto">设置有效 Token 即可同步个人番剧数据和播放状态</p>
      <n-button type="primary" size="large" @click="navigateToSettings" class="!px-8 !rounded-full">前往设置</n-button>
    </div>

    <template v-else>
      <!-- Navigation Tabs -->
      <div class="flex items-center space-x-2 pb-4 border-b border-zinc-200 dark:border-zinc-700/50">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 focus:outline-none"
          :class="[
            activeTab === tab.id
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
          ]"
          @click="handleTabChange(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Loaded Empty State -->
      <div v-if="!loading && collections.length === 0" class="py-20 text-center">
        <n-empty :description="activeTab === 'subscribed' ? '还没有订阅任何番剧，从番剧详情页添加订阅吧' : '空空如也，暂无数据'" />
      </div>

      <!-- Grid Container -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        <!-- Skeleton -->
        <template v-if="loading">
          <div v-for="i in 10" :key="i" class="w-full bg-white dark:bg-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div class="aspect-[3/4] w-full">
              <n-skeleton height="100%" width="100%" />
            </div>
            <div class="p-3 space-y-2">
              <n-skeleton text width="90%" class="mb-1" />
              <n-skeleton text width="60%" />
            </div>
          </div>
        </template>

        <!-- Cards -->
        <template v-else>
          <BangumiCard
            v-for="item in collections"
            :key="item.subject.id"
            :bangumi="item"
            :is-subscribed="subscribedIds.includes(item.subject.id)"
            @click="handleCardClick(item.subject)"
            class="cursor-pointer"
          />
        </template>
      </div>

      <!-- Pagination (Firefly style) -->
      <div v-if="showPagination && !loading" class="flex items-center justify-center gap-1 pt-4">
        <!-- Prev -->
        <button
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="上一页"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Page numbers -->
        <template v-for="(page, idx) in pageNumbers" :key="idx">
          <span v-if="page === '...'" class="inline-flex items-center justify-center w-9 h-9 text-sm text-zinc-400 dark:text-zinc-500 select-none">…</span>
          <button
            v-else
            @click="goToPage(page as number)"
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors"
            :class="[
              currentPage === page
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            ]"
          >
            {{ page }}
          </button>
        </template>

        <!-- Next -->
        <button
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="下一页"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Detail Drawer -->
      <BangumiDetailDrawer
        v-model:show="showDrawer"
        :bangumi="currentBangumi"
        @subscribed="onSubscribeSuccess"
      />
    </template>
  </div>
</template>