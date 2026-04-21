<script setup lang="ts">
import { computed } from "vue";

interface Props {
  bangumi: any;
  isSubscribed?: boolean;
}
const props = defineProps<Props>();

const coverImage = computed(() => {
  return props.bangumi.subject.images?.large || props.bangumi.subject.images?.common || "";
});

const score = computed(() => {
  return props.bangumi.subject.rating?.score || 0;
});

const statusText = computed(() => {
  if (props.bangumi.type === 1) return '想看';
  if (props.bangumi.type === 2) return '看过';
  if (props.bangumi.type === 3) return '在看';
  if (props.bangumi.type === 4) return '搁置';
  if (props.bangumi.type === 5) return '抛弃';
  return '未知';
});

const statusColor = computed(() => {
  if (props.bangumi.type === 2) return 'bg-gray-500'; // 看过
  if (props.bangumi.type === 3) return 'bg-green-500'; // 在看
  return 'bg-blue-500'; // 想看或其他
});

const tags = computed(() => {
  return (props.bangumi.subject.tags || []).slice(0, 3);
});
</script>

<template>
  <div class="group relative overflow-hidden rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-[1.02] block cursor-pointer">
    <div class="aspect-[2/3] relative overflow-hidden">
      <img
        :src="coverImage"
        :alt="bangumi.subject.nameCn || bangumi.subject.name"
        class="w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        decoding="async"
      >

      <!-- Status badge (Left Top) -->
      <div
        class="absolute top-2 left-2 px-2 py-1 rounded-full text-xs text-white font-medium"
        :class="statusColor"
      >
        {{ statusText }}
      </div>

      <!-- Score badge (Right Top) -->
      <div v-if="score > 0" class="absolute top-2 right-2 px-2 py-1 rounded-full text-xs text-white font-medium bg-black/50 backdrop-blur-sm flex items-center gap-1">
        <span class="text-amber-400">★</span> {{ score.toFixed(1) }}
      </div>

      <!-- Subscribed Badge -->
      <div v-if="isSubscribed" class="absolute top-10 right-2 px-2 py-1 rounded-full text-[10px] text-white font-medium bg-indigo-500/80 backdrop-blur-sm flex items-center gap-1">
        已订阅
      </div>

      <!-- Gradient overlay + info (Bottom) -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none"></div>
      <div class="absolute bottom-0 left-0 right-0 p-3">
        <h3 class="font-bold text-sm text-white line-clamp-2 drop-shadow-lg leading-tight">
          {{ bangumi.subject.nameCn || bangumi.subject.name }}
        </h3>
        <p v-if="bangumi.subject.nameCn && bangumi.subject.nameCn !== bangumi.subject.name" class="text-[0.65rem] text-white/50 mt-0.5 line-clamp-1">
          {{ bangumi.subject.name }}
        </p>
        <p class="text-xs text-white/70 mt-1">
          {{ bangumi.subject.date || bangumi.subject.year || '2025' }}
        </p>
        <div class="flex flex-wrap gap-1 mt-1.5" v-if="tags.length">
          <span
            v-for="tag in tags"
            :key="tag.name"
            class="text-[0.6rem] px-1.5 py-0.5 rounded bg-white/20 text-white/90 backdrop-blur-sm"
          >
            {{ tag.name }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>