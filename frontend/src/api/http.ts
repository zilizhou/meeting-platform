import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  // FormData 由浏览器自动带 multipart boundary
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers) {
      delete (config.headers as any)['Content-Type']
    }
  }
  return config
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const data = err.response?.data
    const message = data?.message || err.message || '请求失败'
    const code = data?.code || data?.message?.code
    if (err.response?.status === 403 && (code === 'PASSWORD_CHANGE_REQUIRED' || data?.message?.code === 'PASSWORD_CHANGE_REQUIRED')) {
      const auth = useAuthStore()
      if (auth.user) {
        auth.user = { ...auth.user, mustChangePassword: true }
        localStorage.setItem('user', JSON.stringify(auth.user))
      }
      router.push('/change-password')
    }
    if (err.response?.status === 401) {
      const auth = useAuthStore()
      auth.clearSession()
      router.push('/login')
    }
    const msg =
      typeof message === 'object' && message?.message
        ? message.message
        : message
    return Promise.reject(Array.isArray(msg) ? msg.join('；') : msg)
  },
)

export default http
