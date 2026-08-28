<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 反馈往来</div>
      <h2>校级反馈</h2>
      <p>{{ isSchool ? '查看与各部门的反馈往来。' : '查看校级对本院的反馈并回复。' }}</p>
    </div>

    <div v-if="loading" class="ui-empty">加载中…</div>
    <div v-else-if="!items.length" class="ui-empty">暂无反馈</div>
    <button
      v-for="t in items"
      :key="t.id"
      type="button"
      class="thread-card"
      @click="open(t)"
    >
      <div class="top">
        <strong>{{ t.subject || '反馈' }}</strong>
        <span>{{ formatTime(t.lastMessageAt) }}</span>
      </div>
      <p v-if="isSchool">{{ t.college?.name || '—' }}</p>
      <em>{{ preview(t.lastMessage?.content) }}</em>
      <span class="count">{{ t.messageCount }} 条消息</span>
    </button>

    <SchoolFeedbackPanel
      :open="panelOpen"
      :college-id="panelCollegeId"
      :college-name="panelCollegeName"
      :can-create="isSchool"
      :initial-thread-id="panelThreadId"
      @close="closePanel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoles } from '@/composables/useRoles'
import http from '@/api/http'
import SchoolFeedbackPanel from '@/components/SchoolFeedbackPanel.vue'

interface ThreadRow {
  id: string
  collegeId: string
  subject?: string | null
  lastMessageAt: string
  messageCount: number
  college?: { name: string }
  lastMessage?: { content: string } | null
}

const route = useRoute()
const router = useRouter()
const { canAccessSchoolDashboard, auth } = useRoles()
const isSchool = computed(() => canAccessSchoolDashboard.value)

const loading = ref(false)
const items = ref<ThreadRow[]>([])
const panelOpen = ref(false)
const panelCollegeId = ref('')
const panelCollegeName = ref('')
const panelThreadId = ref('')

async function load() {
  loading.value = true
  try {
    const res: any = await http.get('/feedback')
    items.value = res.items || []
  } finally {
    loading.value = false
  }
}

function open(t: ThreadRow) {
  panelCollegeId.value = t.collegeId
  panelCollegeName.value = t.college?.name || auth.user?.collegeName || ''
  panelThreadId.value = t.id
  panelOpen.value = true
  if (route.path !== `/feedback/${t.id}`) {
    router.replace(`/feedback/${t.id}`)
  }
}

function closePanel() {
  panelOpen.value = false
  panelThreadId.value = ''
  if (route.name === 'feedback-thread') {
    router.replace('/feedback')
  }
}

function preview(text?: string) {
  if (!text) return '暂无内容'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

onMounted(async () => {
  await load()
  const id = String(route.params.id || '')
  if (id) {
    const hit = items.value.find((t) => t.id === id)
    if (hit) open(hit)
    else {
      try {
        const detail: any = await http.get(`/feedback/${id}`)
        panelCollegeId.value = detail.collegeId
        panelCollegeName.value = detail.college?.name || ''
        panelThreadId.value = detail.id
        panelOpen.value = true
      } catch {
        /* ignore */
      }
    }
  }
})
</script>

<style scoped>
.thread-card {
  display: block;
  width: 100%;
  text-align: left;
  background: #fff;
  border: none;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: var(--shadow);
  cursor: pointer;
  font: inherit;
}
.thread-card .top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}
.thread-card .top span {
  color: var(--muted);
  font-size: 12px;
  flex-shrink: 0;
}
.thread-card p {
  margin: 0 0 6px;
  color: var(--joint);
  font-size: 13px;
  font-weight: 600;
}
.thread-card em {
  display: block;
  font-style: normal;
  font-size: 14px;
  line-height: 1.4;
  margin-bottom: 6px;
}
.thread-card .count {
  color: var(--muted);
  font-size: 12px;
}
</style>
