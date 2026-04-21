<script setup lang="ts">
import { h, ref, watch } from 'vue'
import { NMessageProvider, NConfigProvider, darkTheme, NLayout, NLayoutSider, NMenu, NIcon } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { TvOutline, SettingsOutline } from '@vicons/ionicons5'

const route = useRoute()
const router = useRouter()
const activeKey = ref<string>(route.name as string || 'home')

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = [
  {
    label: '我的追番',
    key: 'home',
    icon: renderIcon(TvOutline)
  },
  {
    label: '设置中心',
    key: 'settings',
    icon: renderIcon(SettingsOutline)
  }
]

watch(
  () => route.name,
  (newVal) => {
    if (newVal) activeKey.value = newVal as string
  }
)

const handleMenuClick = (key: string) => {
  activeKey.value = key
  if (key === 'home') {
    router.push('/')
  } else if (key === 'settings') {
    router.push('/settings')
  }
}
</script>
<template>
  <n-config-provider :theme="darkTheme">
    <n-message-provider>
      <n-layout has-sider class="min-h-screen bg-black">
        <n-layout-sider
          bordered
          collapse-mode="width"
          :collapsed-width="64"
          :width="240"
          :collapsed="false"
          class="min-h-screen pt-4"
        >
          <div class="px-4 py-6 text-center text-xl font-bold tracking-wider text-green-400">
            PikPak Auto
          </div>
          <n-menu
            :value="activeKey"
            :options="menuOptions"
            @update:value="handleMenuClick"
            :collapsed-width="64"
            :collapsed-icon-size="22"
          />
        </n-layout-sider>
        <n-layout class="bg-black/50">
          <main class="p-8 h-screen overflow-y-auto">
            <router-view></router-view>
          </main>
        </n-layout>
      </n-layout>
    </n-message-provider>
  </n-config-provider>
</template>