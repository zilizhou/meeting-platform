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
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<AuthUserInfo | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  )

  const isLogin = computed(() => Boolean(token.value))

  async function login(username: string, password: string) {
    const data: any = await http.post('/auth/login', { username, password })
    token.value = data.accessToken
    user.value = data.user
    localStorage.setItem('token', data.accessToken)
    localStorage.setItem('user', JSON.stringify(data.user))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  async function fetchMe() {
    const data: any = await http.get('/auth/me')
    user.value = data
    localStorage.setItem('user', JSON.stringify(data))
  }

  return { token, user, isLogin, login, logout, fetchMe }
})
