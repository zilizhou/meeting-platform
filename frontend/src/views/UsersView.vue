<template>
  <div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
      :title="
        isSchoolAdmin
          ? '校院两级人员管理：校级可跨院查询与纠偏；日常账号由学院管理员维护。'
          : '本院人员由学院管理员/党委书记维护；参会名单请到「参会名单」配置。'
      "
    />

    <div class="toolbar">
      <el-select
        v-if="isSchoolAdmin"
        v-model="collegeId"
        clearable
        filterable
        placeholder="筛选学院"
        style="width: 200px"
        @change="load"
      >
        <el-option
          v-for="c in colleges"
          :key="c.id"
          :label="c.name"
          :value="c.id"
        />
      </el-select>
      <el-input
        v-model="keyword"
        clearable
        placeholder="姓名/账号"
        style="width: 180px"
        @keyup.enter="load"
      />
      <el-button v-if="canManage" type="primary" @click="openCreate">新增人员</el-button>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-table :data="filteredUsers" stripe>
      <el-table-column prop="realName" label="姓名" width="120" />
      <el-table-column prop="username" label="账号" width="140" />
      <el-table-column prop="title" label="职务" width="140">
        <template #default="{ row }">{{ row.title || '—' }}</template>
      </el-table-column>
      <el-table-column v-if="isSchoolAdmin" label="学院" width="160">
        <template #default="{ row }">{{ row.college?.name || '校级' }}</template>
      </el-table-column>
      <el-table-column label="角色" min-width="200">
        <template #default="{ row }">
          <el-tag
            v-for="r in row.roles || []"
            :key="r.code"
            size="small"
            style="margin-right: 4px"
          >
            {{ r.name || r.code }}
          </el-tag>
          <span v-if="!row.roles?.length" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.enabled === false ? 'danger' : 'success'">
            {{ row.enabled === false ? '禁用' : '启用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="canManage" label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <template v-if="canEditRow(row)">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" @click="resetPwd(row)">重置密码</el-button>
            <el-button
              link
              :type="row.enabled === false ? 'success' : 'danger'"
              @click="toggleEnabled(row)"
            >
              {{ row.enabled === false ? '启用' : '禁用' }}
            </el-button>
            <el-button
              v-if="row.id !== roles.auth.user?.id"
              link
              type="danger"
              @click="removeUser(row)"
            >
              删除
            </el-button>
          </template>
          <span v-else class="muted">校级账号不可改</span>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="visible"
      :title="editingId ? '编辑人员' : '新增本院人员'"
      width="520px"
    >
      <el-form label-width="90px">
        <el-form-item v-if="!editingId" label="账号">
          <el-input v-model="form.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="职务">
          <el-input v-model="form.title" placeholder="如：副院长" />
        </el-form-item>
        <el-form-item v-if="isSchoolAdmin && !editingId" label="学院">
          <el-select v-model="form.collegeId" filterable style="width: 100%">
            <el-option
              v-for="c in colleges"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleCodes" multiple style="width: 100%">
            <el-option
              v-for="r in assignableRoles"
              :key="r.code"
              :label="r.name"
              :value="r.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!editingId" label="初始密码">
          <el-input v-model="form.password" placeholder="默认 123456" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

const roles = useRoles()
const isSchoolAdmin = roles.isSchoolAdmin
const canManage = computed(
  () =>
    isSchoolAdmin.value ||
    roles.has('COLLEGE_ADMIN') ||
    roles.has('SECRETARY'),
)

const users = ref<any[]>([])
const colleges = ref<any[]>([])
const roleOptions = ref<any[]>([])
const collegeId = ref('')
const keyword = ref('')
const visible = ref(false)
const editingId = ref('')
const form = reactive({
  username: '',
  realName: '',
  title: '',
  collegeId: '',
  roleCodes: [] as string[],
  password: '123456',
})

const assignableRoles = computed(() =>
  roleOptions.value.filter(
    (r) => r.code !== 'SCHOOL_ADMIN' && r.code !== 'SCHOOL_VIEWER',
  ),
)

const filteredUsers = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return users.value
  return users.value.filter(
    (u) =>
      String(u.realName || '')
        .toLowerCase()
        .includes(kw) ||
      String(u.username || '')
        .toLowerCase()
        .includes(kw),
  )
})

function canEditRow(row: any) {
  if (row.isSchoolAdmin) return isSchoolAdmin.value
  return canManage.value
}

async function load() {
  try {
    if (isSchoolAdmin.value) {
      colleges.value = await http.get('/org/colleges')
    }
    roleOptions.value = await http.get('/org/roles')
    users.value = await http.get('/org/users', {
      params: {
        ...(isSchoolAdmin.value && collegeId.value
          ? { collegeId: collegeId.value }
          : {}),
      },
    })
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

function openCreate() {
  editingId.value = ''
  form.username = ''
  form.realName = ''
  form.title = ''
  form.collegeId = collegeId.value || roles.auth.user?.collegeId || ''
  form.roleCodes = ['ATTENDEE']
  form.password = '123456'
  visible.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  form.username = row.username
  form.realName = row.realName
  form.title = row.title || ''
  form.collegeId = row.collegeId || ''
  form.roleCodes = [...(row.roleCodes || row.roles?.map((r: any) => r.code) || [])]
  visible.value = true
}

async function submit() {
  try {
    if (editingId.value) {
      await http.patch(`/org/users/${editingId.value}`, {
        realName: form.realName,
        title: form.title,
        roleCodes: form.roleCodes,
      })
      ElMessage.success('已更新')
    } else {
      if (!form.username || !form.realName) {
        ElMessage.warning('请填写账号与姓名')
        return
      }
      const payload: any = {
        username: form.username,
        realName: form.realName,
        title: form.title || undefined,
        roleCodes: form.roleCodes,
        password: form.password || '123456',
      }
      if (isSchoolAdmin.value) {
        if (!form.collegeId) {
          ElMessage.warning('请选择学院')
          return
        }
        payload.collegeId = form.collegeId
      }
      await http.post('/org/users', payload)
      ElMessage.success('人员已创建')
    }
    visible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function resetPwd(row: any) {
  try {
    const { value } = await ElMessageBox.prompt(
      `重置 ${row.realName} 的密码`,
      '重置密码',
      { inputValue: '123456', inputPlaceholder: '新密码至少 6 位' },
    )
    await http.post(`/org/users/${row.id}/reset-password`, { password: value })
    ElMessage.success('密码已重置')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
}

async function toggleEnabled(row: any) {
  try {
    const next = row.enabled === false
    await http.post(`/org/users/${row.id}/${next ? 'enable' : 'disable'}`)
    ElMessage.success(next ? '已启用' : '已禁用')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function removeUser(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除用户「${row.realName}」（${row.username}）？有业务数据时将拒绝删除，请改用禁用。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
    )
    await http.delete(`/org/users/${row.id}`)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
