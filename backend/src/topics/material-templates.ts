import { MeetingType } from '../common/constants';

export interface MaterialTemplateItem {
  name: string;
  requiredKey: string;
  isRequired: boolean;
}

const JOINT_TEMPLATES: Record<string, MaterialTemplateItem[]> = {
  REFORM: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '合法合规性审查意见', requiredKey: 'legal', isRequired: true },
    { name: '相关单位征求意见表', requiredKey: 'opinion', isRequired: false },
  ],
  FACULTY: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '人事/师资方案材料', requiredKey: 'personnel', isRequired: true },
    { name: '合法合规性审查意见', requiredKey: 'legal', isRequired: false },
  ],
  STUDENT: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '学工/教务意见材料', requiredKey: 'student_affairs', isRequired: true },
  ],
  RESEARCH: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '学术委员会/科研意见', requiredKey: 'academic', isRequired: true },
  ],
  COOP: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '合作协议草案', requiredKey: 'agreement', isRequired: true },
    { name: '合法合规性审查意见', requiredKey: 'legal', isRequired: false },
  ],
  GOVERNANCE: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '人选材料/推荐表', requiredKey: 'candidate', isRequired: true },
  ],
  AWARD: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '表彰奖励名单及依据', requiredKey: 'award_list', isRequired: true },
  ],
  OTHER: [
    { name: '调研报告/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '合法合规性审查意见（视情况）', requiredKey: 'legal', isRequired: false },
  ],
  PARTY_TRANSFER: [
    { name: '党委会决议材料', requiredKey: 'party_resolution', isRequired: true },
    { name: '落实方案/情况说明', requiredKey: 'survey', isRequired: true },
  ],
};

const PARTY_TEMPLATES: Record<string, MaterialTemplateItem[]> = {
  FIRST_TOPIC: [
    { name: '学习材料/原文及辅导材料', requiredKey: 'study_material', isRequired: true },
    { name: '学习安排或传达要点', requiredKey: 'study_plan', isRequired: false },
  ],
  PARTY_BUILD: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '组织建设方案', requiredKey: 'org_plan', isRequired: true },
  ],
  CADRE: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '干部任免/推荐材料', requiredKey: 'cadre', isRequired: true },
    { name: '前置征求意见表', requiredKey: 'opinion', isRequired: false },
  ],
  TALENT: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '人才引育与服务方案', requiredKey: 'talent', isRequired: true },
  ],
  IDEOLOGY_EDU: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '思政课程/课程思政方案', requiredKey: 'ideology_edu', isRequired: true },
  ],
  MORAL: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '师德师风相关材料', requiredKey: 'moral', isRequired: true },
  ],
  IDEOLOGY: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '意识形态研判报告', requiredKey: 'ideology', isRequired: true },
  ],
  MASS_ORG: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '群团/教代会相关材料', requiredKey: 'mass_org', isRequired: false },
  ],
  PARTY_OTHER: [
    { name: '调研材料/情况说明', requiredKey: 'survey', isRequired: true },
    { name: '前置征求意见表', requiredKey: 'opinion', isRequired: false },
  ],
};

const JOINT_DEFAULT: MaterialTemplateItem[] = JOINT_TEMPLATES.OTHER;
const PARTY_DEFAULT: MaterialTemplateItem[] = PARTY_TEMPLATES.PARTY_OTHER;

/** 按会议类型 + 分类编码生成会前材料清单（均可选，不强制上传） */
export function materialsForCategory(
  meetingType: string,
  categoryCode?: string | null,
): MaterialTemplateItem[] {
  const items =
    meetingType === MeetingType.PARTY_COMMITTEE
      ? categoryCode && PARTY_TEMPLATES[categoryCode]
        ? PARTY_TEMPLATES[categoryCode]
        : PARTY_DEFAULT
      : categoryCode && JOINT_TEMPLATES[categoryCode]
        ? JOINT_TEMPLATES[categoryCode]
        : JOINT_DEFAULT;
  return items.map((x) => ({ ...x, isRequired: false }));
}

/** 临时动议额外清单：动议说明（选填） */
export function withTempMotionMaterials(
  items: MaterialTemplateItem[],
  isTempMotion: boolean,
): MaterialTemplateItem[] {
  if (!isTempMotion) return items;
  const has = items.some((i) => i.requiredKey === 'temp_motion_note');
  if (has) return items;
  return [
    ...items,
    {
      name: '临时动议说明（事由与紧急理由）',
      requiredKey: 'temp_motion_note',
      isRequired: false,
    },
  ];
}

/** 紧急临机处置额外清单：事后补报说明（选填） */
export function withEmergencyMaterials(
  items: MaterialTemplateItem[],
  isEmergency: boolean,
): MaterialTemplateItem[] {
  if (!isEmergency) return items;
  const has = items.some((i) => i.requiredKey === 'emergency_note');
  if (has) return items;
  return [
    ...items,
    {
      name: '紧急临机处置说明（事由与事后补报依据）',
      requiredKey: 'emergency_note',
      isRequired: false,
    },
  ];
}
