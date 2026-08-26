<template>
  <div class="me-page">
    <div class="me-layout">
      <div>
        <div class="profile">
          <div class="avatar">{{ avatarText }}</div>
          <div>
            <h3>{{ auth.user?.realName || '用户' }}</h3>
            <div class="role">
              <template v-if="auth.user?.collegeName">{{ auth.user.collegeName }} · </template>
              {{ auth.user?.title || auth.user?.roles?.join(' / ') || '成员' }}
            </div>
          </div>
        </div>

        <div v-if="isViewerOnly" class="stats">
          <div class="stat party">
            <b>查阅</b>
            <span>校级只读</span>
          </div>
          <div class="stat">
            <b>总览</b>
            <span>双会态势</span>
          </div>
          <div class="stat warn">
            <b>简报</b>
            <span>领导阅件</span>
          </div>
        </div>
        <div v-else class="stats">
          <div class="stat party">
            <b>{{ summary.partyReview + summary.jointReview }}</b>
            <span>待审题</span>
          </div>
          <div class="stat">
            <b>{{ summary.materialRead }}</b>
            <span>待签收</span>
          </div>
          <div class="stat warn">
            <b>{{ summary.supervision }}</b>
            <span>督办</span>
          </div>
        </div>
      </div>

      <div>
        <div class="block">
          <div class="label">账号</div>
          <button class="item" type="button" @click="router.push('/notifications')">
            <div class="ico">消</div>
            <div>
              <strong>消息中心</strong>
              <em>未读 {{ unread }}</em>
            </div>
            <span class="chev">›</span>
          </button>
          <button v-if="canManageUsers" class="item" type="button" @click="router.push('/users')">
            <div class="ico">员</div>
            <div>
              <strong>人员管理</strong>
              <em>本院账号与角色</em>
            </div>
            <span class="chev">›</span>
          </button>
          <button
            v-if="canAccessSchoolDashboard && !isViewerOnly"
            class="item"
            type="button"
            @click="router.push('/admin')"
          >
            <div class="ico">校</div>
            <div>
              <strong>校级监管</strong>
              <em>召开态势 · AI 简报 · 巡视导出</em>
            </div>
            <span class="chev">›</span>
          </button>
          <button
            v-if="isViewerOnly"
            class="item"
            type="button"
            @click="router.push('/admin')"
          >
            <div class="ico">览</div>
            <div>
              <strong>返回总览</strong>
              <em>学期召开 · 预警 · AI 简报</em>
            </div>
            <span class="chev">›</span>
          </button>
        </div>

        <!-- 暂时关闭全部引导
        <div class="block">
          <div class="label">使用帮助</div>
          <button class="item" type="button" @click="restartGuide">
            <div class="ico">引</div>
            <div>
              <strong>重新开始新手引导</strong>
              <em>按当前身份介绍入口与办理步骤</em>
            </div>
            <span class="chev">›</span>
          </button>
          <div class="item mode-item">
            <div class="ico">模</div>
            <div>
              <strong>界面模式</strong>
              <em>新手模式显示“我要办理”和操作提示</em>
            </div>
            <div class="mode-switch" aria-label="界面模式">
              <button type="button" :class="{ on: onboarding.state.mode === 'novice' }" @click="onboarding.setMode('novice')">新手</button>
              <button type="button" :class="{ on: onboarding.state.mode === 'expert' }" @click="onboarding.setMode('expert')">熟练</button>
            </div>
          </div>
        </div>
        -->

        <div class="block">
          <div class="label">关于</div>
          <div class="item static">
            <div class="ico">系</div>
            <div>
              <strong>明德同枢</strong>
              <em>曲阜师范大学二级学院双会管理系统</em>
            </div>
          </div>
        </div>

        <button class="item" type="button" @click="router.push('/change-password')">
          <div class="ico">密</div>
          <div>
            <strong>修改密码</strong>
            <em>定期更换，保障账号安全</em>
          </div>
          <span class="chev">›</span>
        </button>
        <button class="out" type="button" @click="onLogout">退出登录</button>
        <div class="foot">明德同枢 · 曲阜师范大学</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import http from '@/api/http'
// import { useOnboarding } from '@/composables/useOnboarding'

const auth = useAuthStore()
const router = useRouter()
// const onboarding = useOnboarding()
const unread = ref(0)
const summary = reactive({
  partyReview: 0,
  jointReview: 0,
  minutesSign: 0,
  supervision: 0,
  checkin: 0,
  materialRead: 0,
})

const avatarText = computed(() => (auth.user?.realName || '用').slice(0, 1))

const isSchoolAdmin = computed(
  () => auth.user?.isSchoolAdmin || (auth.user?.roles || []).includes('SCHOOL_ADMIN'),
)

const isViewerOnly = computed(
  () =>
    !isSchoolAdmin.value &&
    (auth.user?.roles || []).includes('SCHOOL_VIEWER'),
)

const canAccessSchoolDashboard = computed(
  () =>
    isSchoolAdmin.value || (auth.user?.roles || []).includes('SCHOOL_VIEWER'),
)

const canManageUsers = computed(() => {
  const roles = auth.user?.roles || []
  return (
    isSchoolAdmin.value ||
    roles.includes('COLLEGE_ADMIN') ||
    roles.includes('SECRETARY')
  )
})

async function load() {
  try {
    if (isViewerOnly.value) {
      const n: any = await http.get('/notifications/unread-count')
      unread.value = Number(n?.count ?? n ?? 0)
      return
    }
    const [todos, n]: any[] = await Promise.all([
      http.get('/workspace/todos'),
      http.get('/notifications/unread-count'),
    ])
    Object.assign(summary, todos.summary || {})
    unread.value = Number(n?.count ?? n ?? 0)
  } catch {
    /* ignore */
  }
}

function onLogout() {
  auth.logout()
  router.push('/login')
}

// function restartGuide() {
//   onboarding.restartWelcome()
//   router.push(isViewerOnly.value ? '/admin' : '/work')
// }

onMounted(load)
</script>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  border-radius: 18px;
  background:
    radial-gradient(ellipse 80% 80% at 100% 0%, rgba(122, 69, 72, 0.14), transparent 50%),
    linear-gradient(135deg, #0d2f56 0%, #1a4f8b 100%);
  color: #fff;
  margin-bottom: 12px;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.18);
  display: grid;
  place-items: center;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
}

.profile h3 {
  margin: 0;
  font-size: 18px;
}

.role {
  margin-top: 4px;
  font-size: 13px;
  opacity: 0.8;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.stat {
  background: #fff;
  border-radius: 14px;
  padding: 12px 8px;
  text-align: center;
  box-shadow: var(--shadow);
}

.stat b {
  display: block;
  font-size: 20px;
  color: var(--joint);
}

.stat.party b {
  color: var(--party);
}

.stat.warn b {
  color: var(--warn);
}

.stat span {
  font-size: 11px;
  color: var(--muted);
}

.block {
  background: #fff;
  border-radius: 16px;
  padding: 8px 4px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}

.label {
  padding: 6px 12px 4px;
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
}

.item.static {
  cursor: default;
}

.mode-item { cursor: default; }
.mode-switch { display: flex; margin-left: auto; padding: 2px; border-radius: 9px; background: #eef2f5; }
.mode-switch button { border: 0; border-radius: 7px; padding: 6px 9px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: 12px; }
.mode-switch button.on { background: #fff; color: var(--joint); box-shadow: 0 1px 4px rgba(15, 45, 75, .14); font-weight: 700; }

.ico {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--joint-soft);
  color: var(--joint);
  display: grid;
  place-items: center;
  font-weight: 700;
  flex-shrink: 0;
}

.item strong {
  display: block;
  font-size: 14px;
}

.item em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.chev {
  margin-left: auto;
  color: var(--muted);
  font-size: 18px;
}

.out {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  border: 1px solid #f0c9cc;
  background: #fff;
  color: var(--party);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.foot {
  margin-top: 14px;
  text-align: center;
  font-size: 11px;
  color: #9aa6b5;
  line-height: 1.5;
}

@media (min-width: 1024px) {
  .me-layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: start;
  }
}
</style>
