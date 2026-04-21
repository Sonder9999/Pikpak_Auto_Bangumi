<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { NInput, NInputNumber, NCard, NSwitch, NSelect, useMessage, NSpin } from 'naive-ui';
import { getConfig, updateConfig } from '../api';

const message = useMessage();
const loading = ref(true);
const saving = ref(false);

const config = ref({
  general: { mode: 'server', port: 7810, dbPath: 'data/pikpak-bangumi.db', logLevel: 'INFO', jwtSecret: '' },
  pikpak: { username: '', password: '', cloudBasePath: '/Anime', preferWebMode: true, refreshToken: '', deviceId: '', tokenCachePath: 'data/pikpak_token.json' },
  rss: { defaultPollIntervalMs: 300000, requestTimeoutMs: 30000, maxConsecutiveFailures: 10 },
  rename: { enabled: true, method: 'advance', template: '{title} S{season}E{episode}.{ext}', folderPattern: '{title} ({year})/Season {season}', maxRetries: 3, retryBaseDelayMs: 1000 },
  dandanplay: { enabled: false, appId: '', appSecret: '', chConvert: 1 },
  tmdb: { apiKey: '', language: 'zh-CN' },
  bangumi: { token: '' }
});

const logLevelOptions = [
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'INFO', value: 'INFO' },
  { label: 'WARN', value: 'WARN' },
  { label: 'ERROR', value: 'ERROR' }
];

const renameMethodOptions = [
  { label: 'Advanced', value: 'advance' },
  { label: 'PN', value: 'pn' },
  { label: 'None', value: 'none' }
];

const tmdbLangOptions = [
  { label: 'zh-CN', value: 'zh-CN' },
  { label: 'zh-TW', value: 'zh-TW' },
  { label: 'en-US', value: 'en-US' },
  { label: 'ja-JP', value: 'ja-JP' }
];

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialLoad = true;

onMounted(async () => {
  try {
    const res = await getConfig();
    if (res.data) {
      config.value = { ...config.value, ...res.data };
    }
  } catch (error) {
    message.error('获取配置失败');
  } finally {
    loading.value = false;
    setTimeout(() => {
      isInitialLoad = false;
    }, 100);
  }
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

watch(
  config,
  (newVal) => {
    if (isInitialLoad || loading.value) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    saving.value = true;
    debounceTimer = setTimeout(async () => {
      try {
        await updateConfig(newVal);
        message.success('配置已自动保存');
      } catch (error) {
        message.error('配置保存失败');
      } finally {
        saving.value = false;
      }
    }, 1000);
  },
  { deep: true }
);

</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-100">应用设置</h1>
      <n-spin v-show="saving" size="small" />
    </div>

    <n-spin :show="loading">
      <div class="space-y-6 pb-20">

        <!-- 通用设置 -->
        <n-card title="⚙️ 通用设置 (General)" class="shadow-sm rounded-xl" v-if="config.general">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">本地端口</label>
              <n-input-number v-model:value="config.general.port" :min="1" :max="65535" />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">日志等级</label>
              <n-select v-model:value="config.general.logLevel" :options="logLevelOptions" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-zinc-400 mb-1">数据库路径</label>
              <n-input v-model:value="config.general.dbPath" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-zinc-400 mb-1">JWT Secret</label>
              <n-input v-model:value="config.general.jwtSecret" type="password" show-password-on="click" />
            </div>
          </div>
        </n-card>

        <!-- PikPak -->
        <n-card title="☁️ PikPak设置" class="shadow-sm rounded-xl" v-if="config.pikpak">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">账号 (手机号/邮箱)</label>
              <n-input v-model:value="config.pikpak.username" />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">密码</label>
              <n-input v-model:value="config.pikpak.password" type="password" show-password-on="click" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-zinc-400 mb-1">云端保存路径</label>
              <n-input v-model:value="config.pikpak.cloudBasePath" />
            </div>
          </div>
          <div class="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
            <div>
              <div class="text-sm font-medium">优先网页登录</div>
              <div class="text-xs text-zinc-500">开启后将尝试使用Web API登录以减少验证码影响</div>
            </div>
            <n-switch v-model:value="config.pikpak.preferWebMode" />
          </div>
        </n-card>

        <!-- RSS -->
        <n-card title="📡 RSS设置" class="shadow-sm rounded-xl" v-if="config.rss">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">默认轮询间隔 (ms)</label>
              <n-input-number v-model:value="config.rss.defaultPollIntervalMs" :min="1000" />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">请求超时时间 (ms)</label>
              <n-input-number v-model:value="config.rss.requestTimeoutMs" :min="1000" />
            </div>
          </div>
        </n-card>

        <!-- 重命名 -->
        <n-card title="🏷️ 重命名规则" class="shadow-sm rounded-xl" v-if="config.rename">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-zinc-200">启用自动重命名</span>
            <n-switch v-model:value="config.rename.enabled" />
          </div>
          <div class="space-y-4" v-if="config.rename.enabled">
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">重命名引擎</label>
              <n-select v-model:value="config.rename.method" :options="renameMethodOptions" />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">文件夹模板</label>
              <n-input v-model:value="config.rename.folderPattern" />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">文件模板</label>
              <n-input v-model:value="config.rename.template" />
            </div>
          </div>
        </n-card>

        <!-- TMDB & Bangumi -->
        <n-card title="📺 数据平台 (元数据)" class="shadow-sm rounded-xl">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-if="config.tmdb">
              <label class="block text-sm font-medium text-zinc-400 mb-1">TMDB API Key</label>
              <n-input v-model:value="config.tmdb.apiKey" type="password" show-password-on="click" />
            </div>
            <div v-if="config.tmdb">
              <label class="block text-sm font-medium text-zinc-400 mb-1">TMDB 语言</label>
              <n-select v-model:value="config.tmdb.language" :options="tmdbLangOptions" />
            </div>
            <div v-if="config.bangumi" class="col-span-1 md:col-span-2 mt-2 pt-4 border-t border-zinc-800">
              <label class="block text-sm font-medium text-zinc-400 mb-1">Bangumi.tv Token</label>
              <n-input v-model:value="config.bangumi.token" type="password" show-password-on="click" />
              <p class="text-xs text-zinc-500 mt-1">用于同步你的追番记录和进度</p>
            </div>
          </div>
        </n-card>

      </div>
    </n-spin>
  </div>
</template>