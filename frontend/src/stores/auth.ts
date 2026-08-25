import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '@/api/http'

export interface AuthUserInfo {
  id: string
  username: string
  realName: string
  title?: string
  collegeId?: string | null
  collegeName?: string | null
  isSchoolAdmin: boolean
  roles: string[]
  /** 校级查阅分管学院；空数组表示全校 */
  collegeScopeIds?: string[]
  mustChangePassword?: boolean
}

function persist(token: string, user: AuthUserInfo | null) {
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
  if (user) localStorage.setItem('user', JSON.stringify(user))
  else localStorage.removeItem('user')
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<AuthUserInfo | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  )

  const isLogin = computed(() => Boolean(token.value))
  const mustChangePassword = computed(() => !!user.value?.mustChangePassword)

  async function login(username: string, password: string) {
    const data: any = await http.post('/auth/login', { username, password })
    token.value = data.accessToken
    user.value = data.user
    persist(data.accessToken, data.user)
  }

  async function register(payload: {
    username: string
    password: string
    confirmPassword: string
    realName: string
    collegeId: string
    roleCode?: string
  }) {
    const data: any = await http.post('/auth/register', payload)
    token.value = data.accessToken
    user.value = data.user
    persist(data.accessToken, data.user)
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    const data: any = await http.post('/auth/change-password', {
      oldPassword,
      newPassword,
    })
    token.value = data.accessToken
    user.value = data.user
    persist(data.accessToken, data.user)
  }

  function clearSession() {
    token.value = ''
    user.value = null
    persist('', null)
  }

  async function logout() {
    const t = token.value
    clearSession()
    if (!t) return
    try {
      await http.post(
        '/auth/logout',
        {},
        { headers: { Authorization: `Bearer ${t}` } },
      )
    } catch {
      /* 忽略 */
    }
  }

  async function fetchMe() {
    const data: any = await http.get('/auth/me')
    user.value = data
    localStorage.setItem('user', JSON.stringify(data))
  }

  return {
    token,
    user,
    isLogin,
    mustChangePassword,
    login,
    register,
    changePassword,
    logout,
    clearSession,
    fetchMe,
  }
})
