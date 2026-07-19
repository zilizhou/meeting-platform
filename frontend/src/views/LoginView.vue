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
        <h2>登录</h2>
        <p class="hint">书记 / 院长视图 · 演示密码均为 123456</p>
        <form @submit.prevent="onSubmit">
          <label>
            <span>账号</span>
            <input v-model="form.username" autocomplete="username" placeholder="如 dean / secretary" />
          </label>
          <label>
            <span>密码</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
            />
          </label>
          <p v-if="error" class="err">{{ error }}</p>
          <button class="submit" type="submit" :disabled="loading">
            {{ loading ? '登录中…' : '进入系统' }}
          </button>
        </form>

        <div class="quick">
          <div class="lab">快捷演示账号</div>
          <div class="chips">
            <button type="button" class="party" @click="fill('secretary')">书记 secretary</button>
            <button type="button" class="party" @click="fill('vsecretary')">副书记 vsecretary</button>
            <button type="button" @click="fill('dean')">院长 dean</button>
            <button type="button" @click="fill('office')">办公室 office</button>
            <button type="button" @click="fill('dept')">部门负责人 dept</button>
            <button type="button" @click="fill('admin')">校级 admin</button>
            <button type="button" @click="fill('viewer')">校级查阅 viewer</button>
          </div>
        </div>
      </div>

      <div class="login-foot">
        明德同枢 · 曲阜师范大学二级学院双会管理系统<br />
        对接真实后端 · 演示环境
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({ username: 'dean', password: '123456' })

function fill(username: string) {
  form.username = username
  form.password = '123456'
  error.value = ''
}

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(form.username.trim(), form.password)
    const roles = auth.user?.roles || []
    const isAdmin =
      auth.user?.isSchoolAdmin || roles.includes('SCHOOL_ADMIN')
    const isViewerOnly = !isAdmin && roles.includes('SCHOOL_VIEWER')
    router.push(isViewerOnly ? '/admin' : '/todo')
  } catch (e: any) {
    error.value = String(e?.message || e || '登录失败')
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

label input {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 12px;
  padding: 0 12px;
  background: #eef2f7;
  font: inherit;
  outline: none;
}

label input:focus {
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

.quick {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.lab {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chips button {
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 0;
  background: var(--joint-soft);
  color: var(--joint);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.chips button.party {
  background: var(--party-soft);
  color: var(--party);
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
    min-height: min(580px, calc(100dvh - 48px));
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
    margin: auto 36px;
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
