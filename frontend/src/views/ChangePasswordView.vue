<template>
  <div class="chg-page">
    <div class="chg-card">
      <h2>{{ forced ? '请修改密码' : '修改密码' }}</h2>
      <p class="hint">
        {{
          forced
            ? '首次登录或管理员已重置密码，须修改后方可继续使用'
            : '修改成功后将刷新登录会话'
        }}
      </p>
      <form @submit.prevent="onSubmit">
        <label>
          <span>当前密码</span>
          <input
            v-model="form.oldPassword"
            type="password"
            autocomplete="current-password"
            placeholder="请输入当前密码"
          />
        </label>
        <label>
          <span>新密码</span>
          <input
            v-model="form.newPassword"
            type="password"
            autocomplete="new-password"
            placeholder="至少 10 位，含大小写、数字与特殊字符"
          />
        </label>
        <label>
          <span>确认新密码</span>
          <input
            v-model="form.confirm"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入新密码"
          />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <button class="submit" type="submit" :disabled="loading">
          {{ loading ? '提交中…' : '确认修改' }}
        </button>
      </form>
      <button v-if="!forced" class="back" type="button" @click="router.back()">返回</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const forced = computed(
  () => !!auth.user?.mustChangePassword || route.query.forced === '1',
)

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirm: '',
})
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!form.oldPassword || !form.newPassword) {
    error.value = '请填写完整'
    return
  }
  if (form.newPassword !== form.confirm) {
    error.value = '两次输入的新密码不一致'
    return
  }
  loading.value = true
  try {
    await auth.changePassword(form.oldPassword, form.newPassword)
    const isSystem =
      typeof window !== 'undefined' && window.location.port === '5174'
    if (isSystem) {
      router.replace('/colleges')
      return
    }
    const school =
      auth.user?.isSchoolAdmin ||
      (auth.user?.roles || []).includes('SCHOOL_ADMIN') ||
      (auth.user?.roles || []).includes('SCHOOL_VIEWER')
    router.replace(school ? '/admin' : '/todo')
  } catch (e: any) {
    error.value = typeof e === 'string' ? e : e?.message || '修改失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.chg-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 20px 16px;
  background:
    radial-gradient(ellipse 90% 55% at 8% -8%, rgba(122, 69, 72, 0.12), transparent 52%),
    linear-gradient(180deg, #e8eef6 0%, #f2f5f9 100%);
}
.chg-card {
  width: min(420px, 100%);
  padding: 28px 24px 22px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line, #e2e8f0);
  box-shadow: 0 10px 28px rgba(15, 53, 95, 0.08);
}
.chg-card h2 {
  margin: 0 0 8px;
  font-size: 22px;
  font-family: var(--font-serif, Georgia, serif);
}
.hint {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--muted, #6b7280);
  line-height: 1.45;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
label span {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted, #6b7280);
}
input {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line, #e2e8f0);
  font-size: 14px;
}
.err {
  margin: 0 0 10px;
  color: #b42318;
  font-size: 13px;
}
.submit {
  width: 100%;
  height: 42px;
  border: none;
  border-radius: 10px;
  background: var(--joint, #1a4f8b);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.submit:disabled {
  opacity: 0.65;
  cursor: default;
}
.back {
  display: block;
  width: 100%;
  margin-top: 12px;
  border: none;
  background: transparent;
  color: var(--joint, #1a4f8b);
  cursor: pointer;
  font-size: 13px;
}
</style>
