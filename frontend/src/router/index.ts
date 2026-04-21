import { createRouter, createWebHistory } from 'vue-router'
import CollectionBoard from '../components/CollectionBoard.vue'
// settings placeholder

const routes = [
  {
    path: '/',
    name: 'home',
    component: CollectionBoard
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../components/SettingsPage.vue')
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})