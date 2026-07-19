import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function useRoles() {
  const auth = useAuthStore()
  const roles = computed(() => auth.user?.roles || [])
  const isSchoolAdmin = computed(
    () => auth.user?.isSchoolAdmin || roles.value.includes('SCHOOL_ADMIN'),
  )
  const isSchoolViewer = computed(() => roles.value.includes('SCHOOL_VIEWER'))
  /** 校级监管看板：管理员或查阅 */
  const canAccessSchoolDashboard = computed(
    () => isSchoolAdmin.value || isSchoolViewer.value,
  )
  const has = (...codes: string[]) =>
    isSchoolAdmin.value || codes.some((c) => roles.value.includes(c))

  return {
    auth,
    roles,
    isSchoolAdmin,
    isSchoolViewer,
    canAccessSchoolDashboard,
    has,
    isSecretary: computed(() => has('SECRETARY')),
    isViceSecretary: computed(() => has('VICE_SECRETARY')),
    isDean: computed(() => has('DEAN')),
    isStaff: computed(() =>
      has('MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY', 'VICE_SECRETARY'),
    ),
    isMeetingSecretary: computed(() => has('MEETING_SECRETARY', 'COLLEGE_ADMIN')),
    canReviewJoint: computed(() => has('SECRETARY', 'DEAN')),
    canReviewParty: computed(() => has('SECRETARY')),
    canSignMinutes: computed(() => has('SECRETARY', 'DEAN')),
    canSignPartyMinutes: computed(() => has('SECRETARY', 'VICE_SECRETARY')),
    canHostPartyMeeting: computed(() => has('SECRETARY', 'VICE_SECRETARY')),
    canCreateTopic: computed(() =>
      has(
        'MEETING_SECRETARY',
        'COLLEGE_ADMIN',
        'SECRETARY',
        'VICE_SECRETARY',
        'DEAN',
        'VICE_DEAN',
        'PARTY_MEMBER',
        'DEPT_HEAD',
      ),
    ),
    canCreateMeeting: computed(() =>
      has('MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY', 'VICE_SECRETARY'),
    ),
    canProxyCheckin: computed(() => has('MEETING_SECRETARY', 'COLLEGE_ADMIN')),
    canProxyVote: computed(() => has('MEETING_SECRETARY', 'COLLEGE_ADMIN')),
    canResolve: computed(() =>
      has('MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY', 'DEAN'),
    ),
    canSaveMinutes: computed(() =>
      has('MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY', 'VICE_SECRETARY'),
    ),
    canManageRoster: computed(() =>
      has('MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY'),
    ),
    canManageUsers: computed(() => has('COLLEGE_ADMIN', 'SECRETARY')),
    canManageAvoid: computed(() =>
      has('MEETING_SECRETARY', 'COLLEGE_ADMIN', 'SECRETARY', 'DEAN'),
    ),
    canSubmitReview: computed(() =>
      has(
        'MEETING_SECRETARY',
        'COLLEGE_ADMIN',
        'SECRETARY',
        'VICE_SECRETARY',
        'DEAN',
        'VICE_DEAN',
        'PARTY_MEMBER',
        'DEPT_HEAD',
      ),
    ),
    canPartyResolve: computed(() => has('SECRETARY')),
    isDeptHead: computed(() => has('DEPT_HEAD')),
    canAttendAsGuest: computed(() => has('DEPT_HEAD', 'ATTENDEE')),
    /** 议题库管理员：可修改/删除本院所有议题 */
    canManageTopicLibrary: computed(() => has('COLLEGE_ADMIN')),
    collegeName: computed(() => auth.user?.collegeName || ''),
  }
}
