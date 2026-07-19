<template>
  <div class="login-page">
    <div class="panel">
      <h1>曲阜师范大学</h1>
      <h2>曲师大双会管理系统 · 系统管理端</h2>
      <p>学院 / 用户 / 议题分类主数据维护（仅校级管理员）</p>
      <el-form :model="form" @submit.prevent="onSubmit">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="admin" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="123456"
          />
        </el-form-item>
        <el-button
          type="primary"
          native-type="submit"
          :loading="loading"
          style="width: 100%"
        >
          登录系统管理端
        </el-button>
      </el-form>
      <div class="tips">
        仅校级管理员可登录本端。演示账号：admin / 123456<br />
        业务办理请使用业务端：
        <a href="http://localhost:5173" target="_blank" rel="noopener">localhost:5173</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const form = reactive({ username: 'admin', password: '123456' })

async function onSubmit() {
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    const ok =
      auth.user?.isSchoolAdmin || auth.user?.roles?.includes('SCHOOL_ADMIN')
    if (!ok) {
      auth.logout()
      ElMessage.error('仅校级管理员可登录系统管理端')
      return
    }
    ElMessage.success('登录成功')
    router.push('/colleges')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(15, 53, 95, 0.2), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(26, 79, 139, 0.14), transparent 35%),
    linear-gradient(160deg, #e8eef5, #d2dde9);
}
.panel {
  width: min(420px, 92vw);
  background: #fff;
  border-radius: 16px;
  padding: 32px 28px;
  box-shadow: 0 18px 50px rgba(15, 53, 95, 0.12);
}
h1 {
  margin: 0;
  font-size: 22px;
  color: var(--brand-dark);
}
h2 {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 600;
}
p {
  color: var(--muted);
  font-size: 13px;
  margin: 10px 0 24px;
}
.tips {
  margin-top: 16px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
.tips a {
  color: var(--brand);
}
@media (max-width: 480px) {
  .panel {
    padding: 24px 18px;
    border-radius: 14px;
  }
  h1 {
    font-size: 20px;
  }
  h2 {
    font-size: 15px;
  }
}
</style>
