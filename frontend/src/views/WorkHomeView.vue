<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 双会办事大厅</div>
      <h2>工作台</h2>
      <p>议题征集、会议办理与综合事务统一入口</p>
      <div class="nums">
        <button
          type="button"
          class="num party"
          :class="{ on: activeTab === 'party' }"
          @click="activeTab = 'party'"
        >
          <strong>{{ partyEntryCount }}</strong><span>党组织会议</span>
        </button>
        <button
          type="button"
          class="num joint"
          :class="{ on: activeTab === 'joint' }"
          @click="activeTab = 'joint'"
        >
          <strong>{{ jointEntryCount }}</strong><span>联席会议</span>
        </button>
        <button
          type="button"
          class="num neutral"
          :class="{ on: activeTab === 'general' }"
          @click="activeTab = 'general'"
        >
          <strong>{{ generalEntryCount }}</strong><span>综合</span>
        </button>
      </div>
    </div>

    <section v-if="onboarding.state.mode === 'novice'" class="task-guide">
      <div class="task-guide-head">
        <div><small>新手导航</small><h3>我要办理</h3></div>
        <span>选择一件事，系统分步告诉你怎么做</span>
      </div>
      <div class="task-guide-list">
        <button v-for="task in guideTasks" :key="task.key" type="button" @click="onboarding.startGuide(task.key)">
          <b>{{ task.icon }}</b><span><strong>{{ task.title }}</strong><em>{{ task.desc }}</em></span><i>开始 ›</i>
        </button>
      </div>
    </section>

    <div class="ui-filter is-equal" role="tablist">
      <button
        type="button"
        role="tab"
        class="party"
        :aria-selected="activeTab === 'party'"
        :class="{ on: activeTab === 'party' }"
        @click="activeTab = 'party'"
      >
        党组织会议
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'joint'"
        :class="{ on: activeTab === 'joint' }"
        @click="activeTab = 'joint'"
      >
        党政联席会议
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'general'"
        :class="{ on: activeTab === 'general' }"
        @click="activeTab = 'general'"
      >
        综合
      </button>
    </div>

    <div class="ui-sec">
      <h3>
        <i :class="{ party: activeTab === 'party' }"></i>
        {{ sectionTitle }}
      </h3>
      <span class="n">{{ currentEntryCount }} 项入口</span>
    </div>

    <div v-if="activeTab === 'party'" class="ui-grid">
      <button class="w-entry party" type="button" @click="goCreate('PARTY_COMMITTEE')">
        <div class="ico">题</div>
        <strong>议题征集</strong>
        <em>描述 · AI 生成 · 入议题库</em>
      </button>
      <button class="w-entry party" type="button" @click="router.push('/party-topics')">
        <div class="ico">库</div>
        <strong>议题库</strong>
        <em>审题与流转</em>
      </button>
      <button
        class="w-entry party"
        type="button"
        @click="router.push({ path: '/meet', query: { tab: 'party' } })"
      >
        <div class="ico">会</div>
        <strong>会议管理</strong>
        <em>排期 · 现场 · 归档</em>
      </button>
      <button
        class="w-entry party"
        type="button"
        @click="router.push({ path: '/meet', query: { tab: 'party', status: 'archived' } })"
      >
        <div class="ico">归</div>
        <strong>已归档会议</strong>
        <em>本轨归档 · 查阅</em>
      </button>
      <button
        v-if="canImportParty"
        class="w-entry party"
        type="button"
        @click="router.push({ path: '/meeting-import', query: { type: 'party' } })"
      >
        <div class="ico">档</div>
        <strong>历史会议导入</strong>
        <em>三件套 · 预览 · 归档</em>
      </button>
    </div>

    <div v-else-if="activeTab === 'joint'" class="ui-grid">
      <button class="w-entry joint" type="button" @click="goCreate('JOINT_CONFERENCE')">
        <div class="ico">题</div>
        <strong>议题征集</strong>
        <em>描述 · AI 生成 · 入议题库</em>
      </button>
      <button class="w-entry joint" type="button" @click="router.push('/topics')">
        <div class="ico">库</div>
        <strong>议题库</strong>
        <em>双审与材料</em>
      </button>
      <button
        class="w-entry joint"
        type="button"
        @click="router.push({ path: '/meet', query: { tab: 'joint' } })"
      >
        <div class="ico">会</div>
        <strong>会议管理</strong>
        <em>表决 · 双签 · 归档</em>
      </button>
      <button
        class="w-entry joint"
        type="button"
        @click="router.push({ path: '/meet', query: { tab: 'joint', status: 'archived' } })"
      >
        <div class="ico">归</div>
        <strong>已归档会议</strong>
        <em>本轨归档 · 查阅</em>
      </button>
      <button
        v-if="canImportParty"
        class="w-entry joint"
        type="button"
        @click="router.push({ path: '/meeting-import', query: { type: 'joint' } })"
      >
        <div class="ico">档</div>
        <strong>历史会议导入</strong>
        <em>合订本 · 多场归档</em>
      </button>
    </div>

    <div v-else class="ui-grid">
      <button class="w-entry neutral" type="button" @click="router.push('/supervisions')">
        <div class="ico">督</div>
        <strong>决议督办</strong>
        <em>反馈 · 催办 · 办结</em>
      </button>
      <button class="w-entry neutral" type="button" @click="router.push('/archives')">
        <div class="ico">档</div>
        <strong>档案中心</strong>
        <em>全宗检索</em>
      </button>
      <button
        v-if="canManageRoster"
        class="w-entry neutral"
        type="button"
        @click="router.push('/roster')"
      >
        <div class="ico">名</div>
        <strong>参会名单</strong>
        <em>法定人数依据</em>
      </button>
      <button class="w-entry neutral" type="button" @click="router.push('/agent')">
        <div class="ico">智</div>
        <strong>智能体</strong>
        <em>辅助找事 · 不替代审签</em>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useOnboarding, type GuideKey } from '@/composables/useOnboarding'

type WorkTab = 'party' | 'joint' | 'general'

const router = useRouter()
const auth = useAuthStore()
const onboarding = useOnboarding()
const activeTab = ref<WorkTab>('party')

interface GuideTask { key: GuideKey; icon: string; title: string; desc: string }
const guideTasks = computed<GuideTask[]>(() => {
  const roles = auth.user?.roles || []
  const tasks: GuideTask[] = [
    { key: 'apply-topic', icon: '题', title: '申报议题', desc: '填写事项并提交审核' },
    { key: 'archives', icon: '档', title: '查询档案', desc: '检索已归档会议材料' },
  ]
  if (roles.some((r) => ['SECRETARY', 'DEAN', 'COLLEGE_ADMIN'].includes(r))) tasks.splice(1, 0, { key: 'review-topic', icon: '审', title: '审核议题', desc: '核对材料并给出意见' })
  if (roles.some((r) => ['MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY'].includes(r))) tasks.splice(1, 0, { key: 'organize-meeting', icon: '会', title: '组织会议', desc: '排期、议程与会前准备' }, { key: 'minutes', icon: '纪', title: '形成纪要', desc: '整理结果、签署并归档' })
  if (roles.some((r) => ['SCHOOL_ADMIN', 'COLLEGE_ADMIN', 'MEETING_SECRETARY', 'SECRETARY', 'DEAN'].includes(r))) tasks.push({ key: 'supervision', icon: '督', title: '办理督办', desc: '反馈进展并申请办结' })
  return tasks
})

const canManageRoster = computed(() => {
  const roles = auth.user?.roles || []
  return (
    auth.user?.isSchoolAdmin ||
    roles.includes('SCHOOL_ADMIN') ||
    roles.includes('COLLEGE_ADMIN') ||
    roles.includes('MEETING_SECRETARY') ||
    roles.includes('SECRETARY')
  )
})

const canImportParty = computed(() => {
  const roles = auth.user?.roles || []
  return (
    auth.user?.isSchoolAdmin ||
    roles.includes('SCHOOL_ADMIN') ||
    roles.includes('COLLEGE_ADMIN') ||
    roles.includes('MEETING_SECRETARY') ||
    roles.includes('SECRETARY') ||
    roles.includes('VICE_SECRETARY')
  )
})

const partyEntryCount = computed(() => 4 + (canImportParty.value ? 1 : 0))
const jointEntryCount = computed(() => 4 + (canImportParty.value ? 1 : 0))
const generalEntryCount = computed(() => 3 + (canManageRoster.value ? 1 : 0))

const sectionTitle = computed(() => {
  if (activeTab.value === 'party') return '党组织会议办事'
  if (activeTab.value === 'joint') return '党政联席会议办事'
  return '综合事务'
})

const currentEntryCount = computed(() => {
  if (activeTab.value === 'party') return partyEntryCount.value
  if (activeTab.value === 'joint') return jointEntryCount.value
  return generalEntryCount.value
})

function goCreate(meetingType: string) {
  router.push({ name: 'topic-create', query: { meetingType } })
}
</script>

<style scoped>
.task-guide { margin: 14px 0; padding: 16px; border: 1px solid #d9e3eb; border-radius: 17px; background: linear-gradient(135deg, #fff, #f5f8fb); box-shadow: var(--shadow); }
.task-guide-head { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.task-guide-head small { color: #7a4548; font-weight: 700; }
.task-guide-head h3 { margin: 2px 0 0; font-size: 18px; }
.task-guide-head > span { color: var(--muted); font-size: 12px; }
.task-guide-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
.task-guide-list button { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 11px; border: 1px solid #e1e7ed; border-radius: 12px; background: #fff; color: inherit; text-align: left; cursor: pointer; font: inherit; }
.task-guide-list button:hover { border-color: #9eb2c5; transform: translateY(-1px); }
.task-guide-list b { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border-radius: 10px; background: var(--joint-soft); color: var(--joint); }
.task-guide-list span { min-width: 0; flex: 1; }
.task-guide-list strong, .task-guide-list em { display: block; }
.task-guide-list strong { font-size: 14px; }
.task-guide-list em { margin-top: 2px; overflow: hidden; color: var(--muted); font-size: 11px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.task-guide-list i { color: var(--joint); font-size: 12px; font-style: normal; }
.ui-sec h3 i.party {
  background: var(--party);
}
@media (max-width: 640px) { .task-guide-head { align-items: flex-start; flex-direction: column; } }
</style>
