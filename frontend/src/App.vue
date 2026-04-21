<script setup lang="ts">
import { NMessageProvider, NConfigProvider, darkTheme } from 'naive-ui'
</script>
<template>
  <n-config-provider :theme="darkTheme">
    <n-message-provider>
      <div class="min-h-screen">
        <main class="pt-8">
          <router-view></router-view>
        </main>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>