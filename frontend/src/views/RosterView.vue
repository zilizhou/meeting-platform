<template>
  <div>
    <div class="toolbar">
      <el-radio-group v-model="meetingType" @change="load">
        <el-radio-button value="JOINT_CONFERENCE">联席会名单</el-radio-button>
        <el-radio-button value="PARTY_COMMITTEE">党组织会议名单</el-radio-button>
      </el-radio-group>
      <div class="actions">
        <el-button type="primary" @click="openAdd">添加成员</el-button>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
      title="正式成员计入法定人数与表决；列席可入会但无表决权。"
    />

    <el-table :data="roster" stripe>
      <el-table-column label="姓名" width="140">
        <template #default="{ row }">{{ row.user?.realName }}</template>
      </el-table-column>
      <el-table-column label="职务" width="140">
        <template #default="{ row }">{{ row.user?.title || '-' }}</template>
      </el-table-column>
      <el-table-column label="账号" width="140">
        <template #default="{ row }">{{ row.user?.username }}</template>
      </el-table-column>
      <el-table-column label="身份" width="120">
        <template #default="{ row }">
          <el-tag :type="row.isFormal ? 'success' : 'info'" size="small">
            {{ row.isFormal ? '正式成员' : '列席' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="90" />
      <el-table-column label="操作" min-width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="toggleFormal(row)">
            {{ row.isFormal ? '改为列席' : '改为正式' }}
          </el-button>
          <el-button link type="danger" @click="remove(row)">移除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" title="添加名单成员" width="480px">
      <el-form label-width="90px">
        <el-form-item label="本院用户">
          <el-select v-model="form.userId" filterable style="width: 100%">
            <el-option
              v-for="u in availableUsers"
              :key="u.id"
              :label="`${u.realName}（${u.title || u.username}）`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="身份">
          <el-radio-group v-model="form.isFormal">
            <el-radio :value="true">正式成员</el-radio>
            <el-radio :value="false">列席</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAdd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const meetingType = ref('JOINT_CONFERENCE')
const roster = ref<any[]>([])
const users = ref<any[]>([])
const dialogVisible = ref(false)
const form = reactive({
  userId: '',
  isFormal: true,
  sortOrder: 0,
})

const collegeId = computed(() => auth.user?.collegeId || '')

const availableUsers = computed(() => {
  const inRoster = new Set(roster.value.map((r) => r.userId))
  return users.value.filter(
    (u) => !inRoster.has(u.id) && u.enabled !== false,
  )
})

async function load() {
  if (!collegeId.value) {
    ElMessage.warning('当前账号无学院归属，无法维护名单')
    return
  }
  const [r, u] = await Promise.all([
    http.get('/org/roster', {
      params: { collegeId: collegeId.value, meetingType: meetingType.value },
    }),
    http.get('/org/users', { params: { collegeId: collegeId.value } }),
  ])
  roster.value = r
  users.value = u
}

function openAdd() {
  form.userId = availableUsers.value[0]?.id || ''
  form.isFormal = true
  form.sortOrder = roster.value.length + 1
  dialogVisible.value = true
}

async function submitAdd() {
  if (!form.userId) {
    ElMessage.warning('请选择用户')
    return
  }
  try {
    await http.post('/org/roster', {
      collegeId: collegeId.value,
      meetingType: meetingType.value,
      userId: form.userId,
      isFormal: form.isFormal,
      sortOrder: form.sortOrder,
    })
    ElMessage.success('已添加')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function toggleFormal(row: any) {
  try {
    await http.patch(`/org/roster/${row.id}`, { isFormal: !row.isFormal })
    ElMessage.success('已更新')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function remove(row: any) {
  try {
    await ElMessageBox.confirm(`确认移除 ${row.user?.realName}？`, '移除名单')
    await http.delete(`/org/roster/${row.id}`)
    ElMessage.success('已移除')
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
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
