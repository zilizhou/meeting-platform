<template>
  <div
    class="app-shell"
    :class="{
      'is-detail': isDetail,
      'is-agent': route.name === 'agent',
      'is-overview': route.name === 'admin',
      'is-school': isSchoolShell,
    }"
    :style="{ '--tab-count': tabs.length }"
  >
    <aside class="app-side" aria-label="主导航">
      <div class="side-brand">
        <div class="marks" aria-hidden="true"><i class="p" /><i class="j" /></div>
        <div class="side-brand-name">
          <img
            class="side-emblem"
            src="/brand/qfnu-emblem.png"
            width="36"
            height="36"
            alt="曲阜师范大学校徽"
          />
          <strong>明德同枢</strong>
        </div>
        <em>{{
          isSchoolShell
            ? isViewerShell
              ? '校级查阅 · 双会监管'
              : '校级监管 · 双会总览'
            : '二级学院双会管理系统'
        }}</em>
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
          v-if="isAdmin && !isSchoolShell"
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
    <!-- 暂时关闭全部引导
    <OnboardingGuide />
    -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRoles } from '@/composables/useRoles'
import { useMediaQuery } from '@/composables/useMediaQuery'
import http from '@/api/http'
// import OnboardingGuide from '@/components/OnboardingGuide.vue'

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
const isMobileShell = useMediaQuery('(max-width: 1023px)')
const todoCount = ref(0)
let timer: number | undefined

/** 纯校级查阅：监管相关 + 智能体，避免学院会务干扰 */
const isViewerShell = computed(
  () => isSchoolViewer.value && !isSchoolAdmin.value,
)

/** 校级管理员 / 校级查阅 / 分管查阅共用统计-议题-会议界面 */
const isSchoolShell = computed(() => isSchoolAdmin.value || isSchoolViewer.value)

const schoolLedgerTabs: TabItem[] = [
  {
    name: 'school-topics',
    label: '议题台账',
    path: '/school-topics',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v13.2L12 16.2l-6.5 3V6A1.5 1.5 0 0 1 7 4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.2 8.5h5.6M9.2 11.5h5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'school-meetings',
    label: '会议台账',
    path: '/school-meetings',
    icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
]

const schoolCoreTabs: TabItem[] = [
  {
    name: 'admin',
    label: '会议总览',
    path: '/admin',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-5H4v5Zm10-11h6V4h-6v5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  },
  {
    name: 'agent',
    label: '同枢智伴',
    path: '/agent',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 12.2h.01M14.8 12.2h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M9.2 14.6c.8.9 1.7 1.3 2.8 1.3s2-.4 2.8-1.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'me',
    label: '我的设置',
    path: '/me',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
]

const schoolTabs = computed<TabItem[]>(() => {
  if (!isMobileShell.value) return schoolCoreTabs
  return [schoolCoreTabs[0], ...schoolLedgerTabs, ...schoolCoreTabs.slice(1)]
})

const collegeTabs: TabItem[] = [
  {
    name: 'todo',
    label: '待办',
    path: '/todo',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M8 7h11M8 12h11M8 17h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 7.2h.01M5 12.2h.01M5 17.2h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'topics-home',
    label: '议题',
    path: '/topics-home',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v13.2L12 16.2l-6.5 3V6A1.5 1.5 0 0 1 7 4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.2 8.5h5.6M9.2 11.5h5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    name: 'meet',
    label: '会议',
    path: '/meet',
    icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  // {
  //   name: 'work',
  //   label: '工作台',
  //   path: '/work',
  //   icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  // },
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

const tabs = computed(() => (isSchoolShell.value ? schoolTabs.value : collegeTabs))

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
  if (route.name === name) return true
  if (name === 'topics-home') {
    return ['topics', 'party-topics', 'topic-create', 'topic-detail'].includes(
      String(route.name),
    ) && route.query.from !== 'school'
  }
  if (name === 'admin') {
    return (
      route.name === 'admin-ops' ||
      route.name === 'feedback' ||
      route.name === 'feedback-thread' ||
      ((route.name === 'topic-detail' || route.name === 'meeting-detail') &&
        route.query.from === 'school')
    )
  }
  if (name === 'school-topics') {
    return route.name === 'topic-detail' && route.query.from === 'school-topics'
  }
  if (name === 'school-meetings') {
    return route.name === 'meeting-detail' && route.query.from === 'school-meetings'
  }
  return false
}

function goTab(name: string) {
  const t = tabs.value.find((x) => x.name === name)
  if (t) router.push(t.path)
}

/** 子页面固定回到业务父级，避免 history.back 落到无关页 */
const BACK_PARENT: Record<string, string> = {
  archives: '/meet',
  'party-topics': '/topics-home',
  topics: '/topics-home',
  'topic-create': '/topics-home',
  roster: '/work',
  supervisions: '/work',
}

const VIEWER_BACK_PARENT: Record<string, string> = {
  archives: '/school-meetings',
  supervisions: '/admin',
  audit: '/admin',
  'admin-ops': '/admin',
  'meeting-detail': '/school-meetings',
  'topic-detail': '/school-topics',
}

function goBack() {
  const name = String(route.name || '')
  const parent = isSchoolShell.value
    ? VIEWER_BACK_PARENT[name] || '/admin'
    : BACK_PARENT[name]
  if (parent) {
    router.push(parent)
    return
  }
  if (window.history.length > 1) router.back()
  else router.push(isSchoolShell.value ? '/admin' : '/todo')
}

async function loadTodoCount() {
  if (isSchoolShell.value) {
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
