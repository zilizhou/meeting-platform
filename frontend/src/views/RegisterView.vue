<template>
  <div class="login-page">
    <section class="login-shell">
      <div class="login-brand">
        <div class="brand-glow" aria-hidden="true" />
        <div class="brand-center">
          <img
            class="brand-emblem"
            src="/brand/qfnu-emblem.png"
            width="128"
            height="128"
            alt="曲阜师范大学校徽"
          />
          <div class="brand-hero">
            <p class="product" lang="zh-CN">明德同枢</p>
            <h1>曲阜师范大学二级学院双会<span class="keep">管理系统</span></h1>
            <p class="tagline">党组织会议 · 党政联席会议</p>
            <p class="value">制度硬校验 · 全流程留痕 · AI 辅助不代签</p>
          </div>
        </div>
      </div>

      <div class="login-card">
        <h2>注册</h2>
        <p class="hint">注册后为列席人员权限，书记 / 院长等角色请联系学院管理员分配</p>
        <form @submit.prevent="onSubmit">
          <label>
            <span>姓名</span>
            <input
              v-model="form.realName"
              autocomplete="name"
              placeholder="请输入真实姓名"
            />
          </label>
          <label>
            <span>账号</span>
            <input
              v-model="form.username"
              autocomplete="username"
              placeholder="字母开头，可含数字和下划线"
            />
          </label>
          <label>
            <span>所属学院</span>
            <select v-model="form.collegeId">
              <option value="" disabled>请选择学院</option>
              <option v-for="c in colleges" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </label>
          <label>
            <span>职务（选填）</span>
            <input
              v-model="form.title"
              autocomplete="organization-title"
              placeholder="如教研室主任"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              placeholder="请设置登录密码"
            />
          </label>
          <label>
            <span>确认密码</span>
            <input
              v-model="form.confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="再次输入密码"
            />
          </label>
          <p v-if="error" class="err">{{ error }}</p>
          <button class="submit" type="submit" :disabled="loading">
            {{ loading ? '提交中…' : '注册并进入' }}
          </button>
        </form>
        <p class="switch">
          已有账号？
          <router-link to="/login">返回登录</router-link>
        </p>
      </div>

      <div class="login-foot">
        明德同枢 · 曲阜师范大学二级学院双会管理系统<br />
        对接真实后端 · 演示环境
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import http from '@/api/http'

interface CollegeOption {
  id: string
  name: string
  code: string
}

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const colleges = ref<CollegeOption[]>([])
const form = reactive({
  realName: '',
  username: '',
  collegeId: '',
  title: '',
  password: '',
  confirmPassword: '',
})

onMounted(async () => {
  try {
    colleges.value = await http.get('/auth/colleges')
  } catch (e: any) {
    error.value = String(e?.message || e || '学院列表加载失败')
  }
})

function goAfterAuth() {
  if (auth.mustChangePassword) {
    router.push('/change-password')
    return
  }
  const roles = auth.user?.roles || []
  const isAdmin = auth.user?.isSchoolAdmin || roles.includes('SCHOOL_ADMIN')
  const isViewerOnly = !isAdmin && roles.includes('SCHOOL_VIEWER')
  router.push(isViewerOnly ? '/admin' : '/todo')
}

async function onSubmit() {
  error.value = ''
  if (!form.realName.trim() || !form.username.trim()) {
    error.value = '请填写姓名和账号'
    return
  }
  if (!form.collegeId) {
    error.value = '请选择所属学院'
    return
  }
  if (!form.password) {
    error.value = '请设置密码'
    return
  }
  if (form.password !== form.confirmPassword) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    await auth.register({
      username: form.username.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      realName: form.realName.trim(),
      collegeId: form.collegeId,
      title: form.title.trim() || undefined,
    })
    goAfterAuth()
  } catch (e: any) {
    error.value = String(e?.message || e || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 16px;
  background:
    radial-gradient(ellipse 90% 55% at 8% -8%, rgba(122, 69, 72, 0.14), transparent 52%),
    radial-gradient(ellipse 80% 50% at 100% 0%, rgba(26, 79, 139, 0.2), transparent 48%),
    linear-gradient(180deg, #e8eef6 0%, #f2f5f9 42%, #e4ebf4 100%);
}

.login-shell {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
}

.login-brand {
  position: relative;
  text-align: center;
  margin-bottom: 18px;
  overflow: hidden;
}

.brand-glow {
  display: none;
}

.brand-center {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.brand-emblem {
  width: 88px;
  height: 88px;
  object-fit: contain;
  margin-bottom: 14px;
  filter: drop-shadow(0 6px 16px rgba(15, 53, 95, 0.18));
}

.brand-hero .product {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(34px, 9vw, 42px);
  font-weight: 700;
  letter-spacing: 0.22em;
  line-height: 1.15;
  color: #0f355f;
  text-indent: 0.22em;
}

.brand-hero h1 {
  margin: 10px auto 0;
  max-width: 20em;
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.55;
  color: #2a3f58;
}

.brand-hero h1 .keep {
  white-space: nowrap;
}

.tagline {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.value {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9aa6b5;
}

.login-card {
  background: #fff;
  border-radius: 20px;
  padding: 20px 18px 18px;
  box-shadow: 0 14px 36px rgba(15, 53, 95, 0.1);
}

.login-card h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
}

.hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

label {
  display: block;
  margin-bottom: 12px;
}

label span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}

label input,
label select {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 12px;
  padding: 0 12px;
  background: #eef2f7;
  font: inherit;
  outline: none;
  color: inherit;
}

label select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #64748b 50%),
    linear-gradient(135deg, #64748b 50%, transparent 50%);
  background-position: calc(100% - 16px) 18px, calc(100% - 11px) 18px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

label input:focus,
label select:focus {
  box-shadow: 0 0 0 2px rgba(26, 79, 139, 0.25);
}

.err {
  margin: 0 0 10px;
  color: var(--warn);
  font-size: 13px;
}

.submit {
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--joint);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 8px 18px rgba(26, 79, 139, 0.28);
}

.submit:disabled {
  opacity: 0.7;
}

.switch {
  margin: 12px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.switch a {
  color: var(--joint);
  font-weight: 600;
  text-decoration: none;
}

.switch a:hover {
  text-decoration: underline;
}

.login-foot {
  margin-top: 20px;
  text-align: center;
  font-size: 11px;
  color: #9aa6b5;
  line-height: 1.6;
}

@media (min-width: 1024px) {
  .login-shell {
    width: min(980px, 100%);
    display: grid;
    grid-template-columns: 1.12fr 0.88fr;
    grid-template-rows: 1fr auto;
    background: var(--bg);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 28px 70px rgba(15, 53, 95, 0.18);
    min-height: min(640px, calc(100dvh - 48px));
  }

  .login-brand {
    margin: 0;
    text-align: center;
    padding: 48px 40px;
    display: grid;
    place-items: center;
    background:
      linear-gradient(
        145deg,
        #081c36 0%,
        #0f355f 28%,
        #1a4f8b 58%,
        #2a6aad 78%,
        #3a7ec4 100%
      );
    color: #fff;
  }

  .brand-glow {
    display: block;
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse 70% 55% at 50% 42%, rgba(255, 255, 255, 0.12), transparent 62%),
      radial-gradient(ellipse 55% 45% at 12% 18%, rgba(168, 84, 90, 0.42), transparent 58%),
      radial-gradient(ellipse 50% 40% at 92% 88%, rgba(120, 190, 255, 0.35), transparent 55%);
  }

  .brand-center {
    width: min(360px, 100%);
    padding-bottom: 8px;
  }

  .brand-emblem {
    width: 118px;
    height: 118px;
    margin-bottom: 22px;
    filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.28));
  }

  .brand-hero .product {
    font-size: 54px;
    letter-spacing: 0.28em;
    text-indent: 0.28em;
    color: #fff;
    text-shadow: 0 4px 28px rgba(0, 0, 0, 0.28);
  }

  .brand-hero h1 {
    margin: 16px auto 0;
    max-width: 14em;
    font-size: 17px;
    font-weight: 500;
    line-height: 1.7;
    text-align: center;
    color: rgba(255, 255, 255, 0.92);
  }

  .tagline {
    margin-top: 22px;
    color: rgba(255, 255, 255, 0.8);
  }

  .value {
    color: rgba(255, 255, 255, 0.55);
  }

  .login-card {
    margin: 28px 36px;
    width: min(400px, 100%);
    align-self: center;
  }

  .login-foot {
    grid-column: 1 / -1;
    margin: 0;
    padding: 14px 24px;
    background: rgba(255, 255, 255, 0.72);
    border-top: 1px solid var(--line);
  }
}
</style>
