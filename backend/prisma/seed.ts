import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface CollegeSeedSpec {
  code: string;
  name: string;
  /** 账号前缀 */
  prefix: string;
  people: {
    secretary: { username: string; realName: string };
    viceSecretary: { username: string; realName: string };
    dean: { username: string; realName: string };
    viceDean: { username: string; realName: string };
    office: { username: string; realName: string };
    deptHead: { username: string; realName: string };
  };
}

async function seedCategories() {
  // 与《指导手册（2025年版）》党政联席会议"一、讨论决定事项"（一）～（八）及"二、党委转办落实事项"逐条对应
  const jointCategories = [
    ['REFORM', '改革发展稳定类事项', 1],
    ['FACULTY', '教师队伍建设类事项', 2],
    ['STUDENT', '学生培养类事项', 3],
    ['RESEARCH', '科研平台/项目/经费/成果类事项', 4],
    ['COOP', '教学科研学术交流合作类事项', 5],
    ['GOVERNANCE', '学术委员会等组成人员与人选类事项', 6],
    ['AWARD', '表彰奖励类事项', 7],
    ['OTHER', '其他需联席会议讨论决定的事项', 8],
    ['PARTY_TRANSFER', '党委决议转办联席会共同落实类', 9],
  ] as const;

  for (const [code, name, sortOrder] of jointCategories) {
    await prisma.categoryDict.create({
      data: {
        meetingType: 'JOINT_CONFERENCE',
        code,
        name,
        sortOrder,
        needPrecheck: code === 'PARTY_TRANSFER',
      },
    });
  }

  // 与《指导手册（2025年版）》学院党组织会议"一、讨论决定事项"（一）～（八）逐条对应
  const partyCategories = [
    ['PARTY_BUILD', '党的建设事项', 1],
    ['CADRE', '干部队伍建设事项', 2],
    ['TALENT', '人才政治引领与联系服务事项', 3],
    ['IDEOLOGY_EDU', '师生思想政治工作事项（思政课程/课程思政）', 4],
    ['MORAL', '教风学风与师德师风建设事项', 5],
    ['IDEOLOGY', '意识形态、统一战线、安全稳定事项', 6],
    ['MASS_ORG', '群团组织与教职工代表大会等事项', 7],
    ['PARTY_OTHER', '其他需党组织会议研究决定的事项', 8],
  ] as const;

  for (const [code, name, sortOrder] of partyCategories) {
    await prisma.categoryDict.create({
      data: {
        meetingType: 'PARTY_COMMITTEE',
        code,
        name,
        sortOrder,
        needPrecheck: false,
      },
    });
  }
}

async function seedCollege(
  roleMap: Record<string, string>,
  passwordHash: string,
  spec: CollegeSeedSpec,
) {
  const college = await prisma.college.create({
    data: { code: spec.code, name: spec.name },
  });

  const secretary = await prisma.user.create({
    data: {
      username: spec.people.secretary.username,
      passwordHash,
      realName: spec.people.secretary.realName,
      title: '党委书记',
      collegeId: college.id,
      roles: {
        create: [
          { roleId: roleMap.SECRETARY },
          { roleId: roleMap.COLLEGE_ADMIN },
        ],
      },
    },
  });

  const viceSecretary = await prisma.user.create({
    data: {
      username: spec.people.viceSecretary.username,
      passwordHash,
      realName: spec.people.viceSecretary.realName,
      title: '党委副书记',
      collegeId: college.id,
      roles: {
        create: [
          { roleId: roleMap.VICE_SECRETARY },
          { roleId: roleMap.PARTY_MEMBER },
        ],
      },
    },
  });

  const dean = await prisma.user.create({
    data: {
      username: spec.people.dean.username,
      passwordHash,
      realName: spec.people.dean.realName,
      title: '院长',
      collegeId: college.id,
      roles: { create: [{ roleId: roleMap.DEAN }] },
    },
  });

  const viceDean = await prisma.user.create({
    data: {
      username: spec.people.viceDean.username,
      passwordHash,
      realName: spec.people.viceDean.realName,
      title: '副院长',
      collegeId: college.id,
      roles: { create: [{ roleId: roleMap.VICE_DEAN }] },
    },
  });

  const office = await prisma.user.create({
    data: {
      username: spec.people.office.username,
      passwordHash,
      realName: spec.people.office.realName,
      title: '行政办主任',
      collegeId: college.id,
      roles: {
        create: [
          { roleId: roleMap.MEETING_SECRETARY },
          { roleId: roleMap.COLLEGE_ADMIN },
        ],
      },
    },
  });

  const deptHead = await prisma.user.create({
    data: {
      username: spec.people.deptHead.username,
      passwordHash,
      realName: spec.people.deptHead.realName,
      title: '部门负责人',
      collegeId: college.id,
      roles: { create: [{ roleId: roleMap.DEPT_HEAD }] },
    },
  });

  // 联席会正式成员：书记、院长、副院长、副书记（班子）
  for (const [userId, order] of [
    [secretary.id, 1],
    [dean.id, 2],
    [viceDean.id, 3],
    [viceSecretary.id, 4],
  ] as const) {
    await prisma.rosterMember.create({
      data: {
        collegeId: college.id,
        meetingType: 'JOINT_CONFERENCE',
        userId,
        isFormal: true,
        sortOrder: order,
      },
    });
  }

  // 部门负责人：两会均可列席（有发言权、无表决权）
  await prisma.rosterMember.create({
    data: {
      collegeId: college.id,
      meetingType: 'JOINT_CONFERENCE',
      userId: deptHead.id,
      isFormal: false,
      sortOrder: 90,
    },
  });

  // 党组织会议正式成员：书记 + 副书记（委员）
  for (const [userId, order] of [
    [secretary.id, 1],
    [viceSecretary.id, 2],
  ] as const) {
    await prisma.rosterMember.create({
      data: {
        collegeId: college.id,
        meetingType: 'PARTY_COMMITTEE',
        userId,
        isFormal: true,
        sortOrder: order,
      },
    });
  }

  await prisma.rosterMember.create({
    data: {
      collegeId: college.id,
      meetingType: 'PARTY_COMMITTEE',
      userId: deptHead.id,
      isFormal: false,
      sortOrder: 90,
    },
  });

  return { college, secretary, viceSecretary, dean, viceDean, office, deptHead };
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3600 * 1000);
}

function daysFromNow(d: number) {
  return new Date(Date.now() + d * 24 * 3600 * 1000);
}

async function categoryId(meetingType: string, code: string) {
  const c = await prisma.categoryDict.findFirst({
    where: { meetingType, code },
  });
  return c?.id;
}

function mockMaterials(
  items: Array<{ name: string; requiredKey: string; isRequired?: boolean }>,
) {
  return items.map((m) => ({
    name: m.name,
    requiredKey: m.requiredKey,
    isRequired: m.isRequired ?? true,
    uploaded: true,
    filePath: `mock://${m.requiredKey}.pdf`,
    originalName: `${m.requiredKey}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 128000,
  }));
}

/**
 * 业务 mock（全部归属网络空间安全学院）：
 * 待审题、待签署、待签到、督办、通知、归档等，方便本地/演示环境开箱即用
 */
async function seedMockBusiness(seeded: Awaited<ReturnType<typeof seedCollege>>[]) {
  const cyber = seeded.find((s) => s.college.code === 'CYBER')!;

  const partyBuild = await categoryId('PARTY_COMMITTEE', 'PARTY_BUILD');
  const cadre = await categoryId('PARTY_COMMITTEE', 'CADRE');
  const faculty = await categoryId('JOINT_CONFERENCE', 'FACULTY');
  const research = await categoryId('JOINT_CONFERENCE', 'RESEARCH');
  const student = await categoryId('JOINT_CONFERENCE', 'STUDENT');
  const reform = await categoryId('JOINT_CONFERENCE', 'REFORM');

  // —— 党委待审 / 已通过（故意不绑会议，供「创建会议」弹窗勾选入会）——
  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      categoryId: partyBuild,
      title: '关于调整学院党委委员分工的请示',
      content: '拟调整宣传委员与组织委员分工，加强网络安全意识形态责任制落实。',
      proposerId: cyber.office.id,
      status: 'PENDING_REVIEW',
      isMajor: true,
      materials: {
        create: mockMaterials([
          { name: '调研材料/情况说明', requiredKey: 'survey' },
          { name: '组织建设方案', requiredKey: 'org_plan' },
        ]),
      },
    },
  });

  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      categoryId: cadre,
      title: '发展党员工作计划（2026 上半年）',
      content: '明确发展对象培养考察安排与支部责任清单。',
      proposerId: cyber.office.id,
      status: 'PENDING_REVIEW',
      materials: {
        create: mockMaterials([
          { name: '调研材料/情况说明', requiredKey: 'survey' },
          { name: '干部任免/推荐材料', requiredKey: 'cadre' },
        ]),
      },
    },
  });

  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      categoryId: partyBuild,
      title: '学院党委理论学习计划（2026 下半年）',
      content: '明确学习主题、读本与研讨安排。',
      proposerId: cyber.office.id,
      status: 'APPROVED',
    },
  });

  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      categoryId: cadre,
      title: '党支部书记抓党建述职评议方案',
      content: '明确述职范围、评议指标与结果运用。',
      proposerId: cyber.office.id,
      status: 'APPROVED',
    },
  });

  // —— 联席双审（书记、院长均待审）——
  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: faculty,
      title: '关于引进高层次人才及配套支持方案',
      content: '拟引进密码学与网络攻防方向学科带头人，配套安家费与团队启动经费。',
      proposerId: cyber.office.id,
      status: 'PENDING_REVIEW',
      isMajor: true,
      materials: {
        create: mockMaterials([
          { name: '调研报告/情况说明', requiredKey: 'survey' },
          { name: '人事/师资方案材料', requiredKey: 'personnel' },
        ]),
      },
      jointReviews: {
        create: [
          { side: 'SECRETARY', reviewerId: cyber.secretary.id, decision: 'PENDING' },
          { side: 'DEAN', reviewerId: cyber.dean.id, decision: 'PENDING' },
        ],
      },
    },
  });

  // —— 联席：书记已同意，院长待审 ——
  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: research,
      title: '密码学方向实验室建设论证',
      content: '拟建专用机房，完善安全准入、设备预约与成果归属条款。',
      proposerId: cyber.office.id,
      status: 'PENDING_REVIEW',
      isMajor: true,
      materials: {
        create: mockMaterials([
          { name: '调研报告/情况说明', requiredKey: 'survey' },
          { name: '学术委员会/科研意见', requiredKey: 'academic' },
        ]),
      },
      jointReviews: {
        create: [
          {
            side: 'SECRETARY',
            reviewerId: cyber.secretary.id,
            decision: 'APPROVED',
            comment: '原则同意，注意安全准入条款',
          },
          { side: 'DEAN', reviewerId: cyber.dean.id, decision: 'PENDING' },
        ],
      },
    },
  });

  // —— 联席：草稿（办公室继续完善）——
  await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: student,
      title: '本科生网络安全竞赛奖励办法调整草案',
      content: '拟提高省级以上获奖奖励标准，完善经费列支口径。',
      proposerId: cyber.office.id,
      status: 'DRAFT',
      materials: {
        create: [
          {
            name: '调研报告/情况说明',
            requiredKey: 'survey',
            isRequired: true,
            uploaded: false,
          },
          {
            name: '学工/教务意见材料',
            requiredKey: 'student_affairs',
            isRequired: true,
            uploaded: false,
          },
        ],
      },
    },
  });

  // —— 已审通过、即将上会 ——
  const agendaTopic1 = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: reform,
      title: '学院十四五规划中期调整建议',
      content: '对照学校指标，优化网安学科布局与平台建设节奏。',
      proposerId: cyber.office.id,
      status: 'APPROVED',
      isMajor: true,
      materials: {
        create: mockMaterials([
          { name: '调研报告/情况说明', requiredKey: 'survey' },
          { name: '合法合规性审查意见', requiredKey: 'legal' },
        ]),
      },
      jointReviews: {
        create: [
          { side: 'SECRETARY', reviewerId: cyber.secretary.id, decision: 'APPROVED' },
          { side: 'DEAN', reviewerId: cyber.dean.id, decision: 'APPROVED' },
        ],
      },
    },
  });

  const agendaTopic2 = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: faculty,
      title: '青年教师培养计划（2026）',
      content: '实施导师制与教学科研能力提升专项。',
      proposerId: cyber.office.id,
      status: 'APPROVED',
      materials: {
        create: mockMaterials([
          { name: '调研报告/情况说明', requiredKey: 'survey' },
          { name: '人事/师资方案材料', requiredKey: 'personnel' },
        ]),
      },
      jointReviews: {
        create: [
          { side: 'SECRETARY', reviewerId: cyber.secretary.id, decision: 'APPROVED' },
          { side: 'DEAN', reviewerId: cyber.dean.id, decision: 'APPROVED' },
        ],
      },
    },
  });

  // —— 明天联席会（待签到）——
  const meetJoint = await prisma.meeting.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      title: '网络空间安全学院党政联席会议（第 18 次）',
      periodNo: '2026-18',
      scheduledAt: hoursFromNow(26),
      hostUserId: cyber.dean.id,
      status: 'SCHEDULED',
      isMajor: true,
      shouldAttend: 3,
      actualAttend: 0,
    },
  });
  await prisma.topic.update({
    where: { id: agendaTopic1.id },
    data: { meetingId: meetJoint.id, status: 'ON_AGENDA', sortOrder: 1 },
  });
  await prisma.topic.update({
    where: { id: agendaTopic2.id },
    data: { meetingId: meetJoint.id, status: 'ON_AGENDA', sortOrder: 2 },
  });

  // —— 党组织会议：已审通过议题 + 今日会议 ——
  const partyAgenda = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      categoryId: partyBuild,
      title: '基层党组织换届选举工作安排',
      content: '明确时间节点、候选人条件与纪律要求。',
      proposerId: cyber.office.id,
      status: 'APPROVED',
      isMajor: true,
      materials: {
        create: mockMaterials([
          { name: '调研材料/情况说明', requiredKey: 'survey' },
          { name: '组织建设方案', requiredKey: 'org_plan' },
        ]),
      },
    },
  });
  const meetParty = await prisma.meeting.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      title: '网络空间安全学院党组织会议（第 12 次）',
      periodNo: '2026-12',
      scheduledAt: hoursFromNow(5),
      hostUserId: cyber.secretary.id,
      status: 'SCHEDULED',
      isMajor: true,
      shouldAttend: 2,
    },
  });
  await prisma.topic.update({
    where: { id: partyAgenda.id },
    data: { meetingId: meetParty.id, status: 'ON_AGENDA' },
  });

  // —— 已结束党组织会议 + 待书记/副书记签纪要 ——
  const endedPartyTopic = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      categoryId: partyBuild,
      title: '网络安全意识形态责任制落实方案',
      content: '会中已通过，纪要待党委侧签署。',
      proposerId: cyber.office.id,
      status: 'RESOLVED',
      isMajor: true,
      materials: {
        create: mockMaterials([
          { name: '调研材料/情况说明', requiredKey: 'survey' },
          { name: '组织建设方案', requiredKey: 'org_plan' },
        ]),
      },
    },
  });
  const endedPartyMeet = await prisma.meeting.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'PARTY_COMMITTEE',
      title: '网络空间安全学院党组织会议（第 11 次）',
      periodNo: '2026-11',
      scheduledAt: daysFromNow(-3),
      hostUserId: cyber.viceSecretary.id,
      status: 'ENDED',
      isMajor: true,
      shouldAttend: 2,
      actualAttend: 2,
      canResolve: true,
    },
  });
  await prisma.topic.update({
    where: { id: endedPartyTopic.id },
    data: { meetingId: endedPartyMeet.id },
  });
  await prisma.resolution.create({
    data: {
      topicId: endedPartyTopic.id,
      resultType: 'APPROVED',
      content: '同意按方案落实意识形态责任制。',
    },
  });
  for (const u of [cyber.secretary, cyber.viceSecretary]) {
    await prisma.attendance.create({
      data: {
        meetingId: endedPartyMeet.id,
        userId: u.id,
        isFormal: true,
        checkedIn: true,
        checkedAt: daysFromNow(-3),
      },
    });
  }
  await prisma.minutes.create({
    data: {
      meetingId: endedPartyMeet.id,
      content:
        '一、学习有关文件精神。\n二、审议通过《网络安全意识形态责任制落实方案》。\n三、其他事项。',
      version: 1,
      effectiveAt: null,
    },
  });

  // —— 已结束联席会 + 待双签纪要 ——
  const endedTopic = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: research,
      title: '科研绩效考核办法（试行）',
      content: '会中已原则通过，形成纪要待签署。',
      proposerId: cyber.office.id,
      status: 'RESOLVED',
      materials: {
        create: mockMaterials([
          { name: '调研报告/情况说明', requiredKey: 'survey' },
          { name: '学术委员会/科研意见', requiredKey: 'academic' },
        ]),
      },
      jointReviews: {
        create: [
          { side: 'SECRETARY', reviewerId: cyber.secretary.id, decision: 'APPROVED' },
          { side: 'DEAN', reviewerId: cyber.dean.id, decision: 'APPROVED' },
        ],
      },
    },
  });
  const endedMeet = await prisma.meeting.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      title: '网络空间安全学院党政联席会议（第 17 次）',
      periodNo: '2026-17',
      scheduledAt: daysFromNow(-2),
      hostUserId: cyber.dean.id,
      status: 'ENDED',
      shouldAttend: 3,
      actualAttend: 3,
      canResolve: true,
    },
  });
  await prisma.topic.update({
    where: { id: endedTopic.id },
    data: { meetingId: endedMeet.id },
  });
  await prisma.resolution.create({
    data: {
      topicId: endedTopic.id,
      resultType: 'PRINCIPLE_APPROVED',
      content: '原则通过，办公室完善细则后印发。',
    },
  });
  for (const u of [cyber.secretary, cyber.dean, cyber.viceDean]) {
    await prisma.attendance.create({
      data: {
        meetingId: endedMeet.id,
        userId: u.id,
        isFormal: true,
        checkedIn: true,
        checkedAt: daysFromNow(-2),
      },
    });
  }
  await prisma.minutes.create({
    data: {
      meetingId: endedMeet.id,
      content:
        '一、传达学校有关精神。\n二、审议并通过《科研绩效考核办法（试行）》，原则同意，办公室修订后印发。\n三、其他事项。',
      version: 1,
      effectiveAt: null,
    },
  });

  // —— 督办：本院逾期 ——
  const overdueTopic = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: reform,
      title: '攻防演练实验室安全整改落实',
      content: '针对专项检查问题清单限期整改。',
      proposerId: cyber.office.id,
      status: 'RESOLVED',
    },
  });
  const overdueRes = await prisma.resolution.create({
    data: {
      topicId: overdueTopic.id,
      resultType: 'APPROVED',
      content: '限期完成整改并提交报告。',
    },
  });
  await prisma.supervisionTask.create({
    data: {
      resolutionId: overdueRes.id,
      title: '督办：攻防演练实验室安全整改落实',
      ownerId: cyber.viceDean.id,
      status: 'OVERDUE',
      dueAt: daysFromNow(-3),
    },
  });

  // —— 通知 ——
  const notifyRows = [
    {
      userId: cyber.secretary.id,
      type: 'REVIEW',
      title: '您有党组织会议议题待审题',
      content: '《关于调整学院党委委员分工的请示》等待审题。',
      link: '/todo',
    },
    {
      userId: cyber.dean.id,
      type: 'REVIEW',
      title: '您有联席会议题待双审',
      content: '《密码学方向实验室建设论证》等待院长审。',
      link: '/todo',
    },
    {
      userId: cyber.secretary.id,
      type: 'MINUTES',
      title: '党委纪要待签署',
      content: '第 11 次党组织会议纪要待您或副书记签署。',
      link: `/meetings/${endedPartyMeet.id}?from=party`,
    },
    {
      userId: cyber.viceSecretary.id,
      type: 'MINUTES',
      title: '党委纪要待签署',
      content: '第 11 次党组织会议纪要待您或书记签署。',
      link: `/meetings/${endedPartyMeet.id}?from=party`,
    },
    {
      userId: cyber.secretary.id,
      type: 'MINUTES',
      title: '纪要待签署',
      content: '第 17 次联席会议纪要待您签署。',
      link: `/meetings/${endedMeet.id}`,
    },
    {
      userId: cyber.dean.id,
      type: 'MINUTES',
      title: '纪要待签署',
      content: '第 17 次联席会议纪要待您签署。',
      link: `/meetings/${endedMeet.id}`,
    },
    {
      userId: cyber.office.id,
      type: 'MEETING',
      title: '明日联席会提醒',
      content: '第 18 次党政联席会议已排期，请督促材料与签到。',
      link: `/meetings/${meetJoint.id}`,
    },
  ];
  for (const n of notifyRows) {
    await prisma.notification.create({
      data: {
        collegeId: cyber.college.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        content: n.content,
        link: n.link,
      },
    });
  }

  // —— 已归档会议，便于档案检索 ——
  const archiveTopic = await prisma.topic.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      categoryId: reform,
      title: '网安实验教学中心运行经费预算',
      content: '已归档示例议题。',
      proposerId: cyber.office.id,
      status: 'RESOLVED',
    },
  });
  const archiveMeet = await prisma.meeting.create({
    data: {
      collegeId: cyber.college.id,
      meetingType: 'JOINT_CONFERENCE',
      title: '网络空间安全学院党政联席会议（第 9 次）',
      periodNo: '2025-09',
      scheduledAt: daysFromNow(-40),
      hostUserId: cyber.dean.id,
      status: 'ARCHIVED',
      shouldAttend: 3,
      actualAttend: 3,
    },
  });
  await prisma.topic.update({
    where: { id: archiveTopic.id },
    data: { meetingId: archiveMeet.id },
  });
  await prisma.resolution.create({
    data: {
      topicId: archiveTopic.id,
      resultType: 'APPROVED',
      content: '同意按预算执行。',
      isPublic: false,
    },
  });
  await prisma.minutes.create({
    data: {
      meetingId: archiveMeet.id,
      content: '审议通过网安实验教学中心运行经费预算。',
      version: 1,
      effectiveAt: daysFromNow(-39),
    },
  });

  console.log('Mock 业务数据已生成（网络空间安全学院）：');
  console.log('  待审题 / 待双审 / 待签到会议 / 待签纪要 / 逾期督办 / 通知 / 已归档会议');
}

async function main() {
  console.log('Seeding...');

  await prisma.complianceLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.aiGeneration.deleteMany();
  await prisma.materialReadReceipt.deleteMany();
  await prisma.supervisionFeedback.deleteMany();
  await prisma.supervisionTask.deleteMany();
  await prisma.resolution.deleteMany();
  await prisma.voteRecord.deleteMany();
  await prisma.discussionOpinion.deleteMany();
  await prisma.minutesSign.deleteMany();
  await prisma.minutes.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.jointReview.deleteMany();
  await prisma.material.deleteMany();
  await prisma.transferLink.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.rosterMember.deleteMany();
  await prisma.categoryDict.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.college.deleteMany();

  const roles = await Promise.all(
    [
      ['SCHOOL_ADMIN', '校级管理员'],
      ['SCHOOL_VIEWER', '校级查阅'],
      ['COLLEGE_ADMIN', '学院管理员'],
      ['SECRETARY', '党委书记'],
      ['VICE_SECRETARY', '党委副书记'],
      ['DEAN', '院长'],
      ['VICE_DEAN', '副院长'],
      ['PARTY_MEMBER', '党委委员'],
      ['MEETING_SECRETARY', '会议秘书'],
      ['DEPT_HEAD', '部门负责人'],
      ['ATTENDEE', '列席人员'],
    ].map(([code, name]) => prisma.role.create({ data: { code, name } })),
  );
  const roleMap = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  const passwordHash = await bcrypt.hash('123456', 10);

  const schoolAdmin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash,
      realName: '校级管理员',
      title: '组织部',
      isSchoolAdmin: true,
      roles: { create: [{ roleId: roleMap.SCHOOL_ADMIN }] },
    },
  });

  await prisma.user.create({
    data: {
      username: 'viewer',
      passwordHash,
      realName: '校级查阅',
      title: '组织部',
      isSchoolAdmin: false,
      roles: { create: [{ roleId: roleMap.SCHOOL_VIEWER }] },
    },
  });

  await seedCategories();

  const colleges: CollegeSeedSpec[] = [
    {
      code: 'LIT',
      name: '文学院',
      prefix: 'lit',
      people: {
        secretary: { username: 'lit_secretary', realName: '陈书记' },
        viceSecretary: { username: 'lit_vsecretary', realName: '黄副书记' },
        dean: { username: 'lit_dean', realName: '周院长' },
        viceDean: { username: 'lit_vicedean', realName: '吴副院长' },
        office: { username: 'lit_office', realName: '郑秘书' },
        deptHead: { username: 'lit_dept', realName: '文学院系主任' },
      },
    },
    {
      code: 'SCI',
      name: '物理工程学院',
      prefix: 'sci',
      people: {
        secretary: { username: 'sci_secretary', realName: '刘书记' },
        viceSecretary: { username: 'sci_vsecretary', realName: '徐副书记' },
        dean: { username: 'sci_dean', realName: '孙院长' },
        viceDean: { username: 'sci_vicedean', realName: '钱副院长' },
        office: { username: 'sci_office', realName: '冯秘书' },
        deptHead: { username: 'sci_dept', realName: '物理系主任' },
      },
    },
    {
      code: 'CYBER',
      name: '网络空间安全学院',
      prefix: '',
      people: {
        secretary: { username: 'secretary', realName: '范书记' },
        viceSecretary: { username: 'vsecretary', realName: '孔副书记' },
        dean: { username: 'dean', realName: '王院长' },
        viceDean: { username: 'vicedean', realName: '马副院长' },
        office: { username: 'office', realName: '夏秘书' },
        deptHead: { username: 'dept', realName: '网安系主任' },
      },
    },
  ];

  const seeded = [];
  for (const spec of colleges) {
    seeded.push(await seedCollege(roleMap, passwordHash, spec));
  }

  // 业务 mock 全部归属网络空间安全学院
  await seedMockBusiness(seeded);

  console.log('Seed OK');
  console.log('演示账号（密码均为 123456）：');
  console.log('  校级: admin（管理员）/ viewer（查阅）');
  console.log(
    '  网络空间安全学院: office / secretary / vsecretary / dean / vicedean / dept',
  );
  console.log(
    '  文学院: lit_office / lit_secretary / lit_vsecretary / lit_dean / lit_vicedean / lit_dept',
  );
  console.log(
    '  物理工程学院: sci_office / sci_secretary / sci_vsecretary / sci_dean / sci_vicedean / sci_dept',
  );
  console.log(`校级管理员: ${schoolAdmin.username}；校级查阅: viewer`);
  console.log(
    '提示: mock 在网安学院；用 dean / secretary / vsecretary / dept 登录即可看到。',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
