<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 双会办事大厅</div>
      <h2>工作台</h2>
      <p>议题征集、会议办理与综合事务统一入口</p>
      <div class="nums">
        <div><strong>{{ partyEntryCount }}</strong><span>党组织会议</span></div>
        <div><strong>{{ jointEntryCount }}</strong><span>联席会议</span></div>
        <div><strong>{{ generalEntryCount }}</strong><span>综合</span></div>
      </div>
    </div>

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
        <em>排期 · 现场 · 纪要</em>
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
        <em>表决 · 双签纪要</em>
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

type WorkTab = 'party' | 'joint' | 'general'

const router = useRouter()
const auth = useAuthStore()
const activeTab = ref<WorkTab>('party')

const partyEntryCount = 3
const jointEntryCount = 3

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

const generalEntryCount = computed(() => 3 + (canManageRoster.value ? 1 : 0))

const sectionTitle = computed(() => {
  if (activeTab.value === 'party') return '党组织会议办事'
  if (activeTab.value === 'joint') return '党政联席会议办事'
  return '综合事务'
})

const currentEntryCount = computed(() => {
  if (activeTab.value === 'party') return partyEntryCount
  if (activeTab.value === 'joint') return jointEntryCount
  return generalEntryCount.value
})

function goCreate(meetingType: string) {
  router.push({ name: 'topic-create', query: { meetingType } })
}
</script>

<style scoped>
.ui-sec h3 i.party {
  background: var(--party);
}
</style>
