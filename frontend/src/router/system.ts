import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/SystemLoginView.vue'),
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
      component: () => import('@/layouts/SystemLayout.vue'),
      children: [
        { path: '', redirect: '/colleges' },
        {
          path: 'colleges',
          name: 'colleges',
          component: () => import('@/views/SystemAdminView.vue'),
          meta: { tab: 'colleges' },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/SystemAdminView.vue'),
          meta: { tab: 'users' },
        },
        {
          path: 'viewers',
          name: 'viewers',
          component: () => import('@/views/SystemAdminView.vue'),
          meta: { tab: 'viewers' },
        },
        {
          path: 'categories',
          name: 'categories',
          component: () => import('@/views/SystemAdminView.vue'),
          meta: { tab: 'categories' },
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLogin) {
    return '/login'
  }
  if (to.path === '/login' && auth.isLogin) {
    if (!auth.user?.isSchoolAdmin && !auth.user?.roles?.includes('SCHOOL_ADMIN')) {
      auth.logout()
      return '/login'
    }
    if (auth.mustChangePassword) return '/change-password'
    return '/colleges'
  }
  if (auth.isLogin && auth.mustChangePassword && to.name !== 'change-password') {
    return '/change-password'
  }
  if (!to.meta.public && to.name !== 'change-password') {
    const ok =
      auth.user?.isSchoolAdmin || auth.user?.roles?.includes('SCHOOL_ADMIN')
    if (!ok) {
      auth.logout()
      return '/login'
    }
  }
})

export default router
