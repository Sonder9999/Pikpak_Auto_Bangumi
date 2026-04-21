import { createRouter, createWebHistory } from 'vue-router'
import CollectionBoard from '../components/CollectionBoard.vue'
// settings placeholder

const routes = [
  {
    path: '/',
    name: 'Home',
    component: CollectionBoard
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../components/SettingsPage.vue') // will create later
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})