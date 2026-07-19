<template>
  <div class="layout" :class="{ 'nav-open': navOpen }">
    <div class="nav-mask" @click="navOpen = false" />
    <aside class="sider">
      <div class="brand">
        <div class="brand-title">系统管理端</div>
        <div class="brand-sub">学院 · 用户 · 分类字典</div>
        <el-button class="sider-close" text @click="navOpen = false">关闭</el-button>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="menu"
        @select="navOpen = false"
      >
        <el-menu-item index="/colleges">学院管理</el-menu-item>
        <el-menu-item index="/users">全校用户</el-menu-item>
        <el-menu-item index="/categories">议题分类</el-menu-item>
      </el-menu>
      <div class="sider-foot">
        <a class="ext-link" href="http://localhost:5173" target="_blank" rel="noopener">
          打开业务端 →
        </a>
      </div>
    </aside>
    <section class="main">
      <header class="topbar">
        <div class="topbar-left">
          <button
            type="button"
            class="menu-toggle"
            aria-label="打开导航菜单"
            @click="navOpen = !navOpen"
          >
            <span /><span /><span />
          </button>
          <div>
            <div class="page-title">{{ title }}</div>
            <div class="page-sub">主数据维护 · 与校级监管分离</div>
          </div>
        </div>
        <div class="user">
          <span class="user-name">
            {{ auth.user?.realName }}
            （{{ auth.user?.title || '校级管理员' }}）
          </span>
          <el-button text type="primary" @click="onLogout">退出</el-button>
        </div>
      </header>
      <main class="content">
        <router-view :key="String(route.name)" />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const navOpen = ref(false)

const titleMap: Record<string, string> = {
  colleges: '学院管理',
  users: '全校用户',
  categories: '议题分类',
}

const title = computed(() => titleMap[String(route.name)] || '系统管理')
const activeMenu = computed(() => route.path)

function onLogout() {
  auth.logout()
  router.push('/login')
}

watch(
  () => route.fullPath,
  () => {
    navOpen.value = false
  },
)
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
  min-height: 100dvh;
  background: #f3f6fa;
}
.nav-mask {
  display: none;
}
.sider {
  background: #0f355f;
  color: #fff;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  z-index: 30;
}
.brand {
  padding: 20px 16px 12px;
  position: relative;
}
.brand-title {
  font-size: 16px;
  font-weight: 700;
}
.brand-sub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.75;
}
.sider-close {
  display: none;
  position: absolute;
  top: 12px;
  right: 8px;
  color: #fff !important;
}
.menu {
  border-right: none;
  background: transparent;
  flex: 1;
}
.menu :deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.85);
  height: 44px;
  line-height: 44px;
}
.menu :deep(.el-menu-item.is-active),
.menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.12) !important;
  color: #fff;
}
.sider-foot {
  padding: 12px 16px 20px;
}
.ext-link {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  text-decoration: none;
}
.ext-link:hover {
  color: #fff;
}
.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: #fff;
  border-bottom: 1px solid #e5ebf2;
  position: sticky;
  top: 0;
  z-index: 20;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.menu-toggle {
  display: none;
  width: 40px;
  height: 40px;
  border: 1px solid #e5ebf2;
  border-radius: 10px;
  background: #fff;
  padding: 10px 9px;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
}
.menu-toggle span {
  display: block;
  height: 2px;
  background: #0f355f;
  border-radius: 2px;
}
.page-title {
  font-size: 18px;
  font-weight: 650;
  color: #0f355f;
}
.page-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7c93;
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
  flex-shrink: 0;
}
.user-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.content {
  padding: 20px 24px;
  flex: 1;
  min-width: 0;
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .menu-toggle {
    display: flex;
  }
  .nav-mask {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    z-index: 40;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .layout.nav-open .nav-mask {
    opacity: 1;
    pointer-events: auto;
  }
  .sider {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(280px, 82vw);
    transform: translateX(-105%);
    transition: transform 0.22s ease;
    z-index: 50;
  }
  .layout.nav-open .sider {
    transform: translateX(0);
  }
  .sider-close {
    display: inline-flex;
  }
  .page-sub {
    display: none;
  }
  .content {
    padding: 12px;
  }
  .user-name {
    max-width: 96px;
  }
}
</style>
