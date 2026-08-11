<template>
  <Teleport to="body">
    <div v-if="showWelcome" class="guide-mask">
      <section class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="guide-welcome-title">
        <div class="guide-mark">明德同枢 · 使用引导</div>
        <h2 id="guide-welcome-title">{{ auth.user?.realName || '您好' }}，欢迎进入系统</h2>
        <p class="identity">当前身份：<b>{{ roleTitle }}</b></p>
        <p>{{ roleMission }}</p>
        <div class="welcome-tip"><b>建议先做：</b>{{ isViewer ? '查看校级总览，了解双会召开和预警情况。' : '打开“我的待办”，系统会告诉你现在需要处理什么。' }}</div>
        <div class="guide-actions">
          <button class="primary" type="button" @click="beginOverview">开始 1 分钟引导</button>
          <button type="button" @click="goPrimary">直接进入{{ isViewer ? '总览' : '待办' }}</button>
          <button class="text" type="button" @click="dismissWelcome">暂时跳过</button>
        </div>
      </section>
    </div>

    <aside v-if="activeGuide && currentStep" class="guide-panel" aria-live="polite">
      <div class="guide-progress"><i :style="{ width: progress + '%' }" /></div>
      <div class="guide-panel-head">
        <div><span>{{ activeGuide.title }}</span><small>{{ state.step + 1 }} / {{ activeGuide.steps.length }}</small></div>
        <button type="button" aria-label="关闭引导" @click="closeGuide(false)">×</button>
      </div>
      <h3>{{ currentStep.title }}</h3>
      <p>{{ currentStep.description }}</p>
      <div class="guide-actions compact">
        <button v-if="currentStep.path" type="button" @click="visitStep">{{ currentStep.action || '打开页面' }}</button>
        <button class="primary" type="button" @click="nextStep">{{ isLast ? '完成引导' : '下一步' }}</button>
      </div>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useOnboarding } from '@/composables/useOnboarding'

const router = useRouter()
const auth = useAuthStore()
const { state, isViewer, roleTitle, roleMission, showWelcome, activeGuide, dismissWelcome, startGuide, closeGuide, nextStep } = useOnboarding()
const currentStep = computed(() => activeGuide.value?.steps[state.step])
const isLast = computed(() => state.step === (activeGuide.value?.steps.length || 1) - 1)
const progress = computed(() => ((state.step + 1) / (activeGuide.value?.steps.length || 1)) * 100)

function beginOverview() {
  if (isViewer.value) {
    startGuide('viewer-overview')
  } else startGuide('overview')
}
function goPrimary() { dismissWelcome(); router.push(isViewer.value ? '/admin' : '/todo') }
function visitStep() { if (currentStep.value?.path) router.push(currentStep.value.path) }
</script>

<style scoped>
.guide-mask { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 20px; background: rgba(7, 24, 43, .58); backdrop-filter: blur(3px); }
.welcome-card { width: min(520px, 100%); padding: 28px; border-radius: 22px; background: #fff; box-shadow: 0 24px 70px rgba(5, 26, 48, .28); color: #19324c; }
.guide-mark { color: #7a4548; font-size: 13px; font-weight: 700; letter-spacing: .08em; }
.welcome-card h2 { margin: 10px 0 8px; font-size: 25px; }
.welcome-card p { line-height: 1.7; color: #526579; }
.welcome-card .identity { margin: 0; color: #19324c; }
.welcome-tip { margin: 18px 0; padding: 14px 16px; border-radius: 12px; background: #f2f6fa; line-height: 1.6; }
.guide-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.guide-actions button { border: 1px solid #ccd6e0; border-radius: 10px; padding: 10px 15px; background: #fff; color: #23415f; cursor: pointer; font: inherit; font-weight: 600; }
.guide-actions button.primary { border-color: #174d82; background: #174d82; color: #fff; }
.guide-actions button.text { border-color: transparent; color: #718093; }
.guide-panel { position: fixed; right: 22px; bottom: 88px; z-index: 2800; width: min(390px, calc(100vw - 28px)); overflow: hidden; padding: 20px; border: 1px solid #dbe3ea; border-radius: 18px; background: #fff; box-shadow: 0 18px 55px rgba(7, 31, 55, .22); color: #19324c; }
.guide-progress { height: 4px; margin: -20px -20px 17px; background: #e7edf2; }
.guide-progress i { display: block; height: 100%; background: linear-gradient(90deg, #7a4548, #174d82); transition: width .2s; }
.guide-panel-head { display: flex; align-items: center; justify-content: space-between; }
.guide-panel-head span { font-size: 13px; color: #7a4548; font-weight: 700; }
.guide-panel-head small { margin-left: 8px; color: #8491a0; }
.guide-panel-head > button { border: 0; background: none; font-size: 24px; color: #738191; cursor: pointer; }
.guide-panel h3 { margin: 14px 0 6px; font-size: 20px; }
.guide-panel p { margin: 0 0 18px; color: #5b6d7f; line-height: 1.65; }
.guide-actions.compact { justify-content: flex-end; }
@media (max-width: 700px) { .welcome-card { padding: 22px; } .guide-panel { right: 14px; bottom: 82px; } }
</style>
