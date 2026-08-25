import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('@/views/ChangePasswordView.vue'),
      meta: { allowWhenMustChange: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      children: [
        { path: '', redirect: '/todo' },
        { path: 'workspace', redirect: '/todo' },
        {
          path: 'todo',
          name: 'todo',
          component: () => import('@/views/TodoHomeView.vue'),
        },
        {
          path: 'meet',
          name: 'meet',
          component: () => import('@/views/MeetHomeView.vue'),
        },
        {
          path: 'work',
          name: 'work',
          component: () => import('@/views/WorkHomeView.vue'),
        },
        {
          path: 'agent',
          name: 'agent',
          component: () => import('@/views/AgentHomeView.vue'),
        },
        {
          path: 'me',
          name: 'me',
          component: () => import('@/views/MeHomeView.vue'),
        },
        {
          path: 'topic-create',
          name: 'topic-create',
          component: () => import('@/views/TopicCreateView.vue'),
        },
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('@/views/NotificationsView.vue'),
        },
        {
          path: 'topics',
          name: 'topics',
          component: () => import('@/views/TopicsView.vue'),
        },
        {
          path: 'party-topics',
          name: 'party-topics',
          component: () => import('@/views/PartyTopicsView.vue'),
        },
        {
          path: 'party-import',
          name: 'party-import',
          component: () => import('@/views/PartyImportView.vue'),
        },
        {
          path: 'meeting-import',
          name: 'meeting-import',
          component: () => import('@/views/PartyImportView.vue'),
        },
        {
          /** 党组织会议列表已并入会议首页 */
          path: 'party-meetings',
          redirect: { path: '/meet', query: { tab: 'party' } },
        },
        {
          path: 'topics/:id',
          name: 'topic-detail',
          component: () => import('@/views/TopicDetailView.vue'),
        },
        {
          /** 旧联席会议表格页已废弃，统一到会议首页 */
          path: 'meetings',
          redirect: { path: '/meet', query: { tab: 'joint' } },
        },
        {
          path: 'meetings/:id',
          name: 'meeting-detail',
          component: () => import('@/views/MeetingDetailView.vue'),
        },
        {
          path: 'supervisions',
          name: 'supervisions',
          component: () => import('@/views/SupervisionsView.vue'),
        },
        {
          path: 'roster',
          name: 'roster',
          component: () => import('@/views/RosterView.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/AuditLogsView.vue'),
        },
        {
          path: 'archives',
          name: 'archives',
          component: () => import('@/views/ArchivesView.vue'),
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('@/views/AdminDashboardView.vue'),
        },
      ],
    },
  ],
})

function isSchoolViewerOnly(auth: ReturnType<typeof useAuthStore>) {
  const roles = auth.user?.roles || []
  const isAdmin =
    auth.user?.isSchoolAdmin || roles.includes('SCHOOL_ADMIN')
  return !isAdmin && roles.includes('SCHOOL_VIEWER')
}

/** 校级查阅无需学院会务页（智能体保留） */
const VIEWER_BLOCKED = new Set([
  '/todo',
  '/workspace',
  '/meet',
  '/work',
  '/roster',
  '/users',
  '/topic-create',
  '/party-topics',
  '/party-import',
  '/meeting-import',
  '/topics',
])

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLogin) {
    return '/login'
  }
  if ((to.path === '/login' || to.path === '/register') && auth.isLogin) {
    if (auth.mustChangePassword) return '/change-password'
    return isSchoolViewerOnly(auth) ? '/admin' : '/todo'
  }
  if (auth.isLogin && auth.mustChangePassword && to.name !== 'change-password') {
    return '/change-password'
  }
  if (auth.isLogin && isSchoolViewerOnly(auth)) {
    if (to.path === '/' || to.path === '') return '/admin'
    if (VIEWER_BLOCKED.has(to.path)) return '/admin'
  }
})

export default router
