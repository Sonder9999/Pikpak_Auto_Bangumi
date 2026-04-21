<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { NInput, NButton, NCard, useMessage } from 'naive-ui';
import { getConfig, updateConfig } from '../api';

const router = useRouter();
const message = useMessage();
const loading = ref(true);
const token = ref('');

onMounted(async () => {
  try {
    const res = await getConfig();
    token.value = res.data?.bangumi?.token || '';
  } catch (error) {
    message.error('获取配置失败');
  } finally {
    loading.value = false;
  }
});

const saveSettings = async () => {
  loading.value = true;
  try {
    await updateConfig({
      bangumi: { token: token.value }
    });
    message.success('保存成功');
    router.push('/');
  } catch (error) {
    message.error('保存失败');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="max-w-xl mx-auto p-6">
    <h1 class="text-2xl font-bold mb-6">应用设置</h1>
    <n-card title="Bangumi.tv 授权" class="shadow-sm rounded-xl">
      <div class="mb-4">
        <label class="block text-sm font-medium text-zinc-400 mb-2">Access Token</label>
        <n-input v-model:value="token" type="password" show-password-on="click" placeholder="输入您的个人授权令牌" />
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <n-button @click="router.back()">取消</n-button>
        <n-button type="primary" :loading="loading" @click="saveSettings">保存</n-button>
      </div>
    </n-card>
  </div>
</template>