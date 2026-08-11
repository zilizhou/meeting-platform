<template>
  <div v-if="!isSchoolAdmin" class="deny">
    <el-result
      icon="warning"
      title="无权限"
      sub-title="系统管理仅校级管理员可访问。"
    />
  </div>
  <div v-else>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
      title="本端维护主数据（学院 / 用户 / 分管领导 / 议题分类）。报表、预警、巡视导出请到业务端「校级监管」。"
    />

    <!-- 学院 -->
    <div v-if="panel === 'colleges'">
      <div class="toolbar">
        <el-button type="primary" @click="openCollegeCreate">新增学院</el-button>
        <el-button @click="loadColleges">刷新</el-button>
      </div>
      <el-table :data="colleges" stripe v-loading="loadingColleges">
        <el-table-column prop="name" label="名称" min-width="220" />
        <el-table-column prop="userCount" label="用户" width="80" />
        <el-table-column prop="topicCount" label="议题" width="80" />
        <el-table-column prop="meetingCount" label="会议" width="80" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openCollegeEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="removeCollege(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 用户 -->
    <div v-else-if="panel === 'users'">
      <div class="toolbar">
        <el-select
          v-model="userCollegeId"
          clearable
          filterable
          placeholder="筛选学院"
          style="width: 200px"
          @change="loadUsers"
        >
          <el-option
            v-for="c in colleges"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
        <el-input
          v-model="userKeyword"
          clearable
          placeholder="姓名/账号"
          style="width: 180px"
          @keyup.enter="loadUsers"
        />
        <el-button type="primary" @click="openUserCreate">新增用户</el-button>
        <el-button @click="loadUsers">刷新</el-button>
      </div>
      <el-table :data="filteredUsers" stripe v-loading="loadingUsers">
        <el-table-column prop="realName" label="姓名" width="120" />
        <el-table-column prop="username" label="账号" width="140" />
        <el-table-column prop="title" label="职务" width="140">
          <template #default="{ row }">{{ row.title || '—' }}</template>
        </el-table-column>
        <el-table-column label="学院" width="160">
          <template #default="{ row }">{{ row.college?.name || '校级' }}</template>
        </el-table-column>
        <el-table-column label="角色" min-width="180">
          <template #default="{ row }">
            <el-tag
              v-for="r in row.roles || []"
              :key="r.code"
              size="small"
              style="margin-right: 4px"
            >
              {{ r.name || r.code }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分管范围" min-width="200">
          <template #default="{ row }">
            <template v-if="isViewerRow(row)">
              <el-tag
                size="small"
                :type="(row.collegeScopeIds || []).length ? 'warning' : 'info'"
              >
                {{ row.scopeLabel || '全校' }}
              </el-tag>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.enabled === false ? 'danger' : 'success'">
              {{ row.enabled === false ? '禁用' : '启用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openUserEdit(row)">编辑</el-button>
            <el-button
              v-if="isViewerRow(row)"
              link
              type="primary"
              @click="openScopeEdit(row)"
            >
              设分管
            </el-button>
            <el-button link type="warning" @click="resetPwd(row)">重置密码</el-button>
            <el-button
              link
              :type="row.enabled === false ? 'success' : 'danger'"
              @click="toggleEnabled(row)"
            >
              {{ row.enabled === false ? '启用' : '禁用' }}
            </el-button>
            <el-button
              v-if="row.id !== auth.user?.id"
              link
              type="danger"
              @click="removeUser(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分管领导 -->
    <div v-else-if="panel === 'viewers'">
      <el-alert
        type="success"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        title="为校级查阅账号配置分管学院：不选=全校可见；多选=仅看所选学院（如副校长分管）。"
      />
      <div class="toolbar">
        <el-input
          v-model="viewerKeyword"
          clearable
          placeholder="姓名/账号"
          style="width: 180px"
          @keyup.enter="loadUsers"
        />
        <el-button type="primary" @click="openViewerCreate">新增分管领导</el-button>
        <el-button @click="loadUsers">刷新</el-button>
      </div>
      <el-table :data="viewerUsers" stripe v-loading="loadingUsers">
        <el-table-column prop="realName" label="姓名" width="120" />
        <el-table-column prop="username" label="账号" width="140" />
        <el-table-column prop="title" label="职务" width="140">
          <template #default="{ row }">{{ row.title || '校级查阅' }}</template>
        </el-table-column>
        <el-table-column label="分管学院" min-width="280">
          <template #default="{ row }">
            <template v-if="(row.collegeScopeIds || []).length">
              <el-tag
                v-for="name in row.collegeScopeNames || []"
                :key="name"
                size="small"
                type="warning"
                style="margin-right: 4px; margin-bottom: 2px"
              >
                {{ name }}
              </el-tag>
            </template>
            <el-tag v-else size="small" type="info">全校</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.enabled === false ? 'danger' : 'success'">
              {{ row.enabled === false ? '禁用' : '启用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openScopeEdit(row)">设置分管学院</el-button>
            <el-button link type="primary" @click="openUserEdit(row)">编辑资料</el-button>
            <el-button link type="warning" @click="resetPwd(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分类 -->
    <div v-else>
      <div class="toolbar">
        <el-select
          v-model="catMeetingType"
          style="width: 160px"
          @change="loadCategories"
        >
          <el-option label="联席会" value="JOINT_CONFERENCE" />
          <el-option label="党组织会议" value="PARTY_COMMITTEE" />
          <el-option label="全部" value="" />
        </el-select>
        <el-select v-model="catScope" style="width: 140px" @change="loadCategories">
          <el-option label="全部范围" value="all" />
          <el-option label="校级模板" value="school" />
          <el-option label="学院覆盖" value="college" />
        </el-select>
        <el-button type="primary" @click="openCatCreate">新增分类</el-button>
        <el-button @click="loadCategories">刷新</el-button>
      </div>
      <el-table :data="categories" stripe v-loading="loadingCats">
        <el-table-column prop="code" label="编码" width="140" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="会议类型" width="120">
          <template #default="{ row }">
            {{ row.meetingType === 'PARTY_COMMITTEE' ? '党组织会议' : '联席会' }}
          </template>
        </el-table-column>
        <el-table-column label="范围" width="140">
          <template #default="{ row }">
            {{ row.college?.name || '校级模板' }}
          </template>
        </el-table-column>
        <el-table-column label="需预审" width="90">
          <template #default="{ row }">
            {{ row.needPrecheck ? '是' : '否' }}
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openCatEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="removeCategory(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="collegeVisible"
      :title="collegeEditingId ? '编辑学院' : '新增学院'"
      width="440px"
    >
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="collegeForm.name" placeholder="如 数学科学学院" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="collegeVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCollege">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="userVisible"
      :title="userEditingId ? '编辑用户' : '新增用户'"
      width="520px"
    >
      <el-form label-width="100px">
        <el-form-item v-if="!userEditingId" label="账号类型">
          <el-radio-group v-model="userForm.accountType">
            <el-radio value="college">学院用户</el-radio>
            <el-radio value="school">校级管理员</el-radio>
            <el-radio value="viewer">校级查阅 / 分管领导</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!userEditingId" label="账号">
          <el-input v-model="userForm.username" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="userForm.realName" />
        </el-form-item>
        <el-form-item label="职务">
          <el-input v-model="userForm.title" />
        </el-form-item>
        <el-form-item
          v-if="!userEditingId && userForm.accountType === 'college'"
          label="学院"
        >
          <el-select v-model="userForm.collegeId" filterable style="width: 100%">
            <el-option
              v-for="c in colleges"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="userForm.accountType === 'viewer' || isEditingViewer"
          label="分管学院"
        >
          <el-select
            v-model="userForm.collegeScopeIds"
            multiple
            clearable
            filterable
            placeholder="不选 = 全校；多选 = 仅分管所选学院"
            style="width: 100%"
          >
            <el-option
              v-for="c in colleges"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
          <div class="hint">
            空=全校（校长/书记等）；多选=副校长等分管领导，业务端态势与简报仅见所选学院
          </div>
        </el-form-item>
        <el-form-item
          v-if="userEditingId || userForm.accountType === 'college'"
          label="角色"
        >
          <el-select
            v-model="userForm.roleCodes"
            multiple
            style="width: 100%"
            :disabled="
              !!userEditingId &&
              (userForm.isSchoolAdmin || userForm.accountType === 'viewer')
            "
          >
            <el-option
              v-for="r in collegeRoles"
              :key="r.code"
              :label="r.name"
              :value="r.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!userEditingId" label="初始密码">
          <el-input v-model="userForm.password" placeholder="默认 123456" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="scopeVisible"
      title="设置分管学院"
      width="520px"
      destroy-on-close
    >
      <div v-if="scopeTarget" class="scope-head">
        <strong>{{ scopeTarget.realName }}</strong>
        <span>（{{ scopeTarget.username }} · {{ scopeTarget.title || '校级查阅' }}）</span>
      </div>
      <el-form label-width="100px">
        <el-form-item label="分管学院">
          <el-select
            v-model="scopeCollegeIds"
            multiple
            clearable
            filterable
            placeholder="不选 = 全校可见"
            style="width: 100%"
          >
            <el-option
              v-for="c in colleges"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
          <div class="hint">
            保存后立即生效：该领导登录业务端，态势 / 简报 / 巡视导出均按此处范围过滤。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scopeVisible = false">取消</el-button>
        <el-button type="primary" :loading="scopeSaving" @click="submitScope">
          保存分管范围
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="catVisible"
      :title="catEditingId ? '编辑分类' : '新增分类'"
      width="480px"
    >
      <el-form label-width="100px">
        <el-form-item v-if="!catEditingId" label="会议类型">
          <el-select v-model="catForm.meetingType" style="width: 100%">
            <el-option label="联席会" value="JOINT_CONFERENCE" />
            <el-option label="党组织会议" value="PARTY_COMMITTEE" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!catEditingId" label="编码">
          <el-input v-model="catForm.code" placeholder="如 CUSTOM" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="catForm.name" />
        </el-form-item>
        <el-form-item v-if="!catEditingId" label="范围">
          <el-radio-group v-model="catForm.scope">
            <el-radio value="school">校级模板</el-radio>
            <el-radio value="college">学院覆盖</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="!catEditingId && catForm.scope === 'college'"
          label="学院"
        >
          <el-select v-model="catForm.collegeId" filterable style="width: 100%">
            <el-option
              v-for="c in colleges"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="需预审">
          <el-switch v-model="catForm.needPrecheck" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="catForm.sortOrder" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCategory">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

const route = useRoute()
const { isSchoolAdmin, auth } = useRoles()

const panel = computed(() => String(route.meta.tab || route.name || 'colleges'))

const colleges = ref<any[]>([])
const users = ref<any[]>([])
const categories = ref<any[]>([])
const roleOptions = ref<any[]>([])

const loadingColleges = ref(false)
const loadingUsers = ref(false)
const loadingCats = ref(false)

const userCollegeId = ref('')
const userKeyword = ref('')
const viewerKeyword = ref('')
const catMeetingType = ref('JOINT_CONFERENCE')
const catScope = ref('school')

const scopeVisible = ref(false)
const scopeSaving = ref(false)
const scopeTarget = ref<any>(null)
const scopeCollegeIds = ref<string[]>([])

const collegeVisible = ref(false)
const collegeEditingId = ref('')
const collegeForm = reactive({ name: '' })

const userVisible = ref(false)
const userEditingId = ref('')
const userForm = reactive({
  username: '',
  realName: '',
  title: '',
  collegeId: '',
  roleCodes: [] as string[],
  password: '123456',
  accountType: 'college' as 'college' | 'school' | 'viewer',
  isSchoolAdmin: false,
  collegeScopeIds: [] as string[],
})

const isEditingViewer = computed(
  () =>
    !!userEditingId.value &&
    (userForm.accountType === 'viewer' ||
      userForm.roleCodes.includes('SCHOOL_VIEWER')),
)

const catVisible = ref(false)
const catEditingId = ref('')
const catForm = reactive({
  meetingType: 'JOINT_CONFERENCE',
  code: '',
  name: '',
  scope: 'school' as 'school' | 'college',
  collegeId: '',
  needPrecheck: false,
  sortOrder: 0,
})

const collegeRoles = computed(() =>
  roleOptions.value.filter(
    (r) => r.code !== 'SCHOOL_ADMIN' && r.code !== 'SCHOOL_VIEWER',
  ),
)

const filteredUsers = computed(() => {
  const kw = userKeyword.value.trim().toLowerCase()
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

function isViewerRow(row: any) {
  const codes = row.roleCodes || row.roles?.map((r: any) => r.code) || []
  return codes.includes('SCHOOL_VIEWER') && !row.isSchoolAdmin
}

const viewerUsers = computed(() => {
  const kw = viewerKeyword.value.trim().toLowerCase()
  return users.value.filter((u) => {
    if (!isViewerRow(u)) return false
    if (!kw) return true
    return (
      String(u.realName || '')
        .toLowerCase()
        .includes(kw) ||
      String(u.username || '')
        .toLowerCase()
        .includes(kw)
    )
  })
})

async function loadColleges() {
  loadingColleges.value = true
  try {
    colleges.value = await http.get('/system/colleges')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loadingColleges.value = false
  }
}

async function loadUsers() {
  loadingUsers.value = true
  try {
    // 分管领导页必须拉全量（含 collegeId 为空的校级查阅）
    const filterCollege =
      panel.value === 'viewers' ? '' : userCollegeId.value
    users.value = await http.get('/org/users', {
      params: {
        ...(filterCollege ? { collegeId: filterCollege } : {}),
      },
    })
    if (!roleOptions.value.length) {
      roleOptions.value = await http.get('/org/roles')
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loadingUsers.value = false
  }
}

async function loadCategories() {
  loadingCats.value = true
  try {
    categories.value = await http.get('/system/categories', {
      params: {
        ...(catMeetingType.value ? { meetingType: catMeetingType.value } : {}),
        scope: catScope.value || 'all',
      },
    })
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loadingCats.value = false
  }
}

async function loadPanel() {
  if (!isSchoolAdmin.value) return
  const p = panel.value
  if (p === 'colleges') {
    await loadColleges()
  } else if (p === 'users' || p === 'viewers') {
    if (!colleges.value.length) await loadColleges()
    await loadUsers()
  } else {
    if (!colleges.value.length) await loadColleges()
    await loadCategories()
  }
}

function openViewerCreate() {
  openUserCreate()
  userForm.accountType = 'viewer'
  userForm.roleCodes = []
  userForm.title = '副校长'
  userForm.collegeScopeIds = []
}

function openScopeEdit(row: any) {
  scopeTarget.value = row
  scopeCollegeIds.value = [...(row.collegeScopeIds || [])]
  scopeVisible.value = true
}

async function submitScope() {
  if (!scopeTarget.value?.id) return
  scopeSaving.value = true
  try {
    await http.patch(`/org/users/${scopeTarget.value.id}`, {
      collegeScopeIds: scopeCollegeIds.value,
    })
    ElMessage.success(
      scopeCollegeIds.value.length
        ? `已设置分管 ${scopeCollegeIds.value.length} 所学院`
        : '已设为全校查阅（未限定分管学院）',
    )
    scopeVisible.value = false
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    scopeSaving.value = false
  }
}

function openCollegeCreate() {
  collegeEditingId.value = ''
  collegeForm.name = ''
  collegeVisible.value = true
}

function openCollegeEdit(row: any) {
  collegeEditingId.value = row.id
  collegeForm.name = row.name
  collegeVisible.value = true
}

async function submitCollege() {
  try {
    if (!collegeForm.name.trim()) {
      ElMessage.warning('请填写学院名称')
      return
    }
    if (collegeEditingId.value) {
      await http.patch(`/system/colleges/${collegeEditingId.value}`, {
        name: collegeForm.name,
      })
      ElMessage.success('学院已更新')
    } else {
      await http.post('/system/colleges', {
        name: collegeForm.name,
      })
      ElMessage.success('学院已创建')
    }
    collegeVisible.value = false
    await loadColleges()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function removeCollege(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除学院「${row.name}」？有业务数据时将拒绝删除。`,
      '删除学院',
      { type: 'warning' },
    )
    await http.delete(`/system/colleges/${row.id}`)
    ElMessage.success('已删除')
    await loadColleges()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
}

function openUserCreate() {
  userEditingId.value = ''
  userForm.username = ''
  userForm.realName = ''
  userForm.title = ''
  userForm.collegeId = userCollegeId.value || ''
  userForm.roleCodes = ['ATTENDEE']
  userForm.password = '123456'
  userForm.accountType = 'college'
  userForm.isSchoolAdmin = false
  userForm.collegeScopeIds = []
  userVisible.value = true
}

function openUserEdit(row: any) {
  userEditingId.value = row.id
  userForm.username = row.username
  userForm.realName = row.realName
  userForm.title = row.title || ''
  userForm.collegeId = row.collegeId || ''
  userForm.roleCodes = [
    ...(row.roleCodes || row.roles?.map((r: any) => r.code) || []),
  ]
  userForm.isSchoolAdmin = !!row.isSchoolAdmin
  userForm.accountType = row.isSchoolAdmin
    ? 'school'
    : (row.roleCodes || row.roles?.map((r: any) => r.code) || []).includes(
          'SCHOOL_VIEWER',
        )
      ? 'viewer'
      : 'college'
  userForm.collegeScopeIds = [...(row.collegeScopeIds || [])]
  userVisible.value = true
}

async function submitUser() {
  try {
    if (userEditingId.value) {
      if (userForm.isSchoolAdmin) {
        await http.patch(`/org/users/${userEditingId.value}`, {
          realName: userForm.realName,
          title: userForm.title,
        })
      } else if (userForm.accountType === 'viewer') {
        await http.patch(`/org/users/${userEditingId.value}`, {
          realName: userForm.realName,
          title: userForm.title,
          collegeScopeIds: userForm.collegeScopeIds,
        })
      } else {
        await http.patch(`/org/users/${userEditingId.value}`, {
          realName: userForm.realName,
          title: userForm.title,
          roleCodes: userForm.roleCodes,
        })
      }
      ElMessage.success('已更新')
    } else {
      if (!userForm.username || !userForm.realName) {
        ElMessage.warning('请填写账号与姓名')
        return
      }
      if (userForm.accountType === 'school') {
        await http.post('/system/users', {
          username: userForm.username,
          realName: userForm.realName,
          title: userForm.title || '校级管理员',
          password: userForm.password || '123456',
          isSchoolAdmin: true,
          roleCodes: ['SCHOOL_ADMIN'],
        })
      } else if (userForm.accountType === 'viewer') {
        await http.post('/system/users', {
          username: userForm.username,
          realName: userForm.realName,
          title: userForm.title || '校级查阅',
          password: userForm.password || '123456',
          roleCodes: ['SCHOOL_VIEWER'],
          collegeScopeIds: userForm.collegeScopeIds,
        })
      } else {
        if (!userForm.collegeId) {
          ElMessage.warning('请选择学院')
          return
        }
        await http.post('/system/users', {
          username: userForm.username,
          realName: userForm.realName,
          title: userForm.title || undefined,
          collegeId: userForm.collegeId,
          roleCodes: userForm.roleCodes,
          password: userForm.password || '123456',
        })
      }
      ElMessage.success('用户已创建')
    }
    userVisible.value = false
    await loadUsers()
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
    await loadUsers()
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
    await loadUsers()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
}

function openCatCreate() {
  catEditingId.value = ''
  catForm.meetingType = catMeetingType.value || 'JOINT_CONFERENCE'
  catForm.code = ''
  catForm.name = ''
  catForm.scope = 'school'
  catForm.collegeId = ''
  catForm.needPrecheck = false
  catForm.sortOrder = 0
  catVisible.value = true
}

function openCatEdit(row: any) {
  catEditingId.value = row.id
  catForm.meetingType = row.meetingType
  catForm.code = row.code
  catForm.name = row.name
  catForm.needPrecheck = !!row.needPrecheck
  catForm.sortOrder = row.sortOrder ?? 0
  catVisible.value = true
}

async function submitCategory() {
  try {
    if (catEditingId.value) {
      await http.patch(`/system/categories/${catEditingId.value}`, {
        name: catForm.name,
        needPrecheck: catForm.needPrecheck,
        sortOrder: catForm.sortOrder,
      })
      ElMessage.success('分类已更新')
    } else {
      if (!catForm.code.trim() || !catForm.name.trim()) {
        ElMessage.warning('请填写编码与名称')
        return
      }
      if (catForm.scope === 'college' && !catForm.collegeId) {
        ElMessage.warning('请选择学院')
        return
      }
      await http.post('/system/categories', {
        meetingType: catForm.meetingType,
        code: catForm.code,
        name: catForm.name,
        collegeId: catForm.scope === 'college' ? catForm.collegeId : undefined,
        needPrecheck: catForm.needPrecheck,
        sortOrder: catForm.sortOrder,
      })
      ElMessage.success('分类已创建')
    }
    catVisible.value = false
    await loadCategories()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function removeCategory(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认删除分类「${row.name}」？已被议题引用时将拒绝删除。`,
      '删除分类',
      { type: 'warning' },
    )
    await http.delete(`/system/categories/${row.id}`)
    ElMessage.success('已删除')
    await loadCategories()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
}

watch(panel, () => {
  loadPanel()
})

onMounted(loadPanel)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.deny {
  padding: 40px 0;
}
.hint {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
.muted {
  color: #94a3b8;
}
.scope-head {
  margin-bottom: 14px;
  font-size: 14px;
  color: #334155;
}
.scope-head strong {
  color: #0f172a;
}
</style>
