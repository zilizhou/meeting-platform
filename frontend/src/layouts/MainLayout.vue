<template>
  <div
    class="app-shell"
    :class="{
      'is-detail': isDetail,
      'is-agent': route.name === 'agent',
    }"
  >
    <aside class="app-side" aria-label="主导航">
      <div class="side-brand">
        <div class="marks" aria-hidden="true"><i class="p" /><i class="j" /></div>
        <strong>明德同枢</strong>
        <em>{{ isViewerShell ? '校级查阅 · 双会监管' : '二级学院双会管理系统' }}</em>
      </div>
      <nav class="side-nav">
        <button
          v-for="t in tabs"
          :key="t.name"
          type="button"
          :class="{ on: isTabActive(t.name) }"
          @click="goTab(t.name)"
        >
          <span v-html="t.icon" />
          {{ t.label }}
          <span v-if="t.name === 'todo' && todoCount > 0" class="badge">{{ todoCount }}</span>
        </button>
      </nav>
      <div class="side-more">
        <button v-if="canViewAudit" type="button" @click="router.push('/audit')">操作审计</button>
        <button
          v-if="isAdmin && !isViewerShell"
          type="button"
          @click="router.push('/admin')"
        >
          校级监管
        </button>
        <button v-if="canManageUsers" type="button" @click="router.push('/users')">人员管理</button>
      </div>
    </aside>

    <div class="app-body">
      <main class="app-content">
        <button v-if="showBack" class="app-back" type="button" @click="goBack">‹ 返回</button>
        <router-view />
      </main>
    </div>

    <nav class="app-tabbar" aria-label="底部导航">
      <button
        v-for="t in tabs"
        :key="t.name"
        type="button"
        class="app-tab"
        :class="{ on: isTabActive(t.name) }"
        @click="goTab(t.name)"
      >
        <span v-if="t.name === 'todo' && todoCount > 0" class="badge">{{ todoCount }}</span>
        <span v-html="t.icon" />
        {{ t.label }}
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRoles } from '@/composables/useRoles'
import http from '@/api/http'

interface TabItem {
  name: string
  label: string
  path: string
  icon: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isSchoolAdmin, isSchoolViewer } = useRoles()
const todoCount = ref(0)
let timer: number | undefined

/** 纯校级查阅：导航只保留监管相关，避免学院会务干扰 */
const isViewerShell = computed(
  () => isSchoolViewer.value && !isSchoolAdmin.value,
)

const collegeTabs: TabItem[] = [
  {
    name: 'todo',
    label: '待办',
    path: '/todo',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M8 7h11M8 12h11M8 17h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 7.2h.01M5 12.2h.01M5 17.2h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'meet',
    label: '会议',
    path: '/meet',
    icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'work',
    label: '工作台',
    path: '/work',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  },
  {
    name: 'agent',
    label: '智能体',
    path: '/agent',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 12.2h.01M14.8 12.2h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M9.2 14.6c.8.9 1.7 1.3 2.8 1.3s2-.4 2.8-1.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'me',
    label: '我的',
    path: '/me',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
]

const viewerTabs: TabItem[] = [
  {
    name: 'admin',
    label: '总览',
    path: '/admin',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-5H4v5Zm10-11h6V4h-6v5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  },
  {
    name: 'supervisions',
    label: '督办',
    path: '/supervisions',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 11l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  },
  {
    name: 'archives',
    label: '档案',
    path: '/archives',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v8A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  },
  {
    name: 'me',
    label: '我的',
    path: '/me',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
]

const tabs = computed(() => (isViewerShell.value ? viewerTabs : collegeTabs))

const tabNames = computed(() => new Set(tabs.value.map((t) => t.name)))

const isDetail = computed(() => !tabNames.value.has(String(route.name || '')))

/** 子页面保留轻量返回；议题/会议详情页自带返回按钮 */
const showBack = computed(() => {
  const name = String(route.name || '')
  return isDetail.value && !['meeting-detail', 'topic-detail'].includes(name)
})

const isAdmin = computed(
  () =>
    auth.user?.isSchoolAdmin ||
    auth.user?.roles?.includes('SCHOOL_ADMIN') ||
    auth.user?.roles?.includes('SCHOOL_VIEWER'),
)

const canManageUsers = computed(() => {
  const roles = auth.user?.roles || []
  return (
    auth.user?.isSchoolAdmin ||
    roles.includes('SCHOOL_ADMIN') ||
    roles.includes('COLLEGE_ADMIN') ||
    roles.includes('SECRETARY')
  )
})

const canViewAudit = computed(() => {
  const roles = auth.user?.roles || []
  return (
    isAdmin.value ||
    roles.includes('COLLEGE_ADMIN') ||
    roles.includes('MEETING_SECRETARY') ||
    roles.includes('SECRETARY') ||
    roles.includes('DEAN')
  )
})

function isTabActive(name: string) {
  return route.name === name
}

function goTab(name: string) {
  const t = tabs.value.find((x) => x.name === name)
  if (t) router.push(t.path)
}

/** 子页面固定回到业务父级，避免 history.back 落到无关页 */
const BACK_PARENT: Record<string, string> = {
  archives: '/meet',
  'party-topics': '/work',
  topics: '/work',
  'topic-create': '/work',
  roster: '/work',
  supervisions: '/work',
}

const VIEWER_BACK_PARENT: Record<string, string> = {
  archives: '/admin',
  supervisions: '/admin',
  audit: '/admin',
  'meeting-detail': '/admin',
  'topic-detail': '/admin',
}

function goBack() {
  const name = String(route.name || '')
  const parent = isViewerShell.value
    ? VIEWER_BACK_PARENT[name] || '/admin'
    : BACK_PARENT[name]
  if (parent) {
    router.push(parent)
    return
  }
  if (window.history.length > 1) router.back()
  else router.push(isViewerShell.value ? '/admin' : '/todo')
}

async function loadTodoCount() {
  if (isViewerShell.value) {
    todoCount.value = 0
    return
  }
  try {
    const data: any = await http.get('/workspace/todos')
    todoCount.value = Number(data?.summary?.total ?? data?.items?.length ?? 0)
  } catch {
    todoCount.value = 0
  }
}

function refreshBadges() {
  loadTodoCount()
}

onMounted(() => {
  refreshBadges()
  timer = window.setInterval(refreshBadges, 60000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

watch(
  () => route.fullPath,
  () => refreshBadges(),
)
</script>
