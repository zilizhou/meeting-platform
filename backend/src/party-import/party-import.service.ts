import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  allowWeakPassword,
  hashPassword,
  resolveInitialPassword,
} from '../common/password-policy';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { AuthUser } from '../common/types';
import {
  MeetingStatus,
  MeetingType,
  ResolutionType,
  RoleCode,
  TopicStatus,
  VoteMethod,
} from '../common/constants';
import { assertCollegeVisible, assertAnyRole } from '../common/roles';
import { FIRST_TOPIC_CODE } from '../common/first-topic';
import {
  ImportMeetingType,
  MeetingImportConfirmDto,
  MeetingImportDraft,
  MeetingImportPreview,
  PartyImportPersonDraft,
} from './party-import.types';
import {
  buildMinutesContent,
  buildTopics,
  extractDocText,
  guessMeetingTitle,
  isLikelyFirstTopic,
  normalizePersonName,
  parseAttendanceBlocks,
  parseCollegeHint,
  parseHostRecorder,
  parseLocation,
} from './party-import.parser';
import {
  alignSegments,
  detectMeetingType,
  splitAgendaSegments,
  splitMinutesSegments,
  splitRecordSegments,
  toDateKey,
} from './party-import.split';

const IMPORT_ROLES = [
  RoleCode.MEETING_SECRETARY,
  RoleCode.COLLEGE_ADMIN,
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
  RoleCode.DEAN,
] as const;

/** 议题表 / 会议记录原件挂在首个议题材料上；纪要挂会议线下纪要附件 */
type EvidenceSlot = {
  kind: 'agenda' | 'record';
  file: Express.Multer.File;
};

@Injectable()
export class PartyImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  assertCanImport(user: AuthUser) {
    assertAnyRole(
      user,
      [...IMPORT_ROLES],
      '仅会议秘书/学院管理员/书记/院长可导入历史会议',
    );
  }

  async preview(
    user: AuthUser,
    files: {
      agenda?: Express.Multer.File;
      record?: Express.Multer.File;
      minutes?: Express.Multer.File;
    },
    meetingTypeHint?: string,
  ): Promise<MeetingImportPreview> {
    this.assertCanImport(user);
    const agendaFile = files.agenda;
    const recordFile = files.record;
    const minutesFile = files.minutes;
    if (!agendaFile || !recordFile || !minutesFile) {
      throw new BadRequestException('请同时上传议题表、会议记录、会议纪要三份文件');
    }
    this.files.normalizeMulterFile(agendaFile);
    this.files.normalizeMulterFile(recordFile);
    this.files.normalizeMulterFile(minutesFile);

    const [agendaText, recordText, minutesText] = await Promise.all([
      extractDocText(agendaFile.buffer, agendaFile.originalname),
      extractDocText(recordFile.buffer, recordFile.originalname),
      extractDocText(minutesFile.buffer, minutesFile.originalname),
    ]);

    const meetingType = detectMeetingType(
      agendaText,
      recordText,
      minutesText,
      meetingTypeHint,
    );
    const collegeNameHint = parseCollegeHint(agendaText, recordText, minutesText);
    const college = await this.resolveCollege(user, collegeNameHint);

    const agendas = splitAgendaSegments(agendaText, meetingType);
    const records = splitRecordSegments(recordText, meetingType);
    const minutesSegs = splitMinutesSegments(minutesText, meetingType);
    const bundles = alignSegments(agendas, records, minutesSegs);

    if (!bundles.length) {
      throw new BadRequestException('未能从文件中识别出任何会议场次');
    }

    const meetings: MeetingImportDraft[] = [];
    for (const b of bundles) {
      meetings.push(
        await this.buildDraftFromBundle(
          b,
          meetingType,
          college?.id || user.collegeId,
          college?.name || collegeNameHint,
        ),
      );
    }

    const batchWarnings: string[] = [];
    if (!college) {
      batchWarnings.push(
        collegeNameHint
          ? `未匹配到学院「${collegeNameHint}」，请确认账号学院归属`
          : '未能从文件识别学院',
      );
    }
    const unselected = meetings.filter((m) => !m.selected).length;
    if (unselected > 0) {
      batchWarnings.push(
        `规则 B：有 ${unselected} 场未对齐齐全（缺议题表/记录/纪要之一），默认不勾选；勾选后可强制导入`,
      );
    }
    if (meetingType === 'JOINT_CONFERENCE') {
      batchWarnings.push(
        `已识别党政联席合订本，共 ${meetings.length} 场；确认时仅导入勾选场次`,
      );
    }
    batchWarnings.push(
      '纪要将按现行规则挂为线下附件归档，不再做线上代签；议题表与会议记录作为原件材料保留。',
    );

    const withFirstTopic =
      meetingType === 'PARTY_COMMITTEE'
        ? meetings.filter((m) => m.topics.some((t) => t.isFirstTopic)).length
        : 0;
    const missingFirstTopic =
      meetingType === 'PARTY_COMMITTEE'
        ? meetings.filter(
            (m) => m.selected && !m.topics.some((t) => t.isFirstTopic),
          ).length
        : 0;
    if (meetingType === 'PARTY_COMMITTEE' && missingFirstTopic > 0) {
      batchWarnings.push(
        `有 ${missingFirstTopic} 场勾选会议未识别到第一议题；不影响导入，导入后可在会议详情中设置。`,
      );
    }

    const selected = meetings.filter((m) => m.selected).length;
    return {
      meetingType,
      collegeNameHint,
      collegeId: college?.id || user.collegeId || null,
      collegeName: college?.name || null,
      warnings: batchWarnings,
      meetings,
      stats: {
        total: meetings.length,
        selected,
        unselected: meetings.length - selected,
        withFirstTopic,
        missingFirstTopic,
      },
    };
  }

  async confirm(
    user: AuthUser,
    dto: MeetingImportConfirmDto,
    files: {
      agenda?: Express.Multer.File;
      record?: Express.Multer.File;
      minutes?: Express.Multer.File;
    },
  ) {
    this.assertCanImport(user);
    if (!files.agenda || !files.record || !files.minutes) {
      throw new BadRequestException('确认导入时须再次附带三份原件');
    }
    const meetingType = dto.meetingType || 'PARTY_COMMITTEE';
    const selected = (dto.meetings || []).filter((m) => m.selected);
    if (!selected.length) {
      throw new BadRequestException('请至少勾选一场会议再导入');
    }

    const collegeId = dto.collegeId || user.collegeId;
    if (!collegeId) throw new BadRequestException('请指定学院');
    assertCollegeVisible(user, collegeId);
    if (!user.isSchoolAdmin && user.collegeId && user.collegeId !== collegeId) {
      throw new ForbiddenException('只能导入本院会议');
    }
    const college = await this.prisma.college.findUnique({ where: { id: collegeId } });
    if (!college) throw new NotFoundException('学院不存在');

    const results: Array<{
      meetingId: string;
      title: string;
      link: string;
    }> = [];
    const createdUsersAll: Array<{
      id: string;
      username: string;
      realName: string;
    }> = [];

    for (const draft of selected) {
      if (!draft.topics?.length) {
        throw new BadRequestException(`「${draft.title || draft.key}」至少保留一项议题`);
      }
      if (!draft.people?.length) {
        throw new BadRequestException(`「${draft.title || draft.key}」参会人员不能为空`);
      }
      const minutesContent = (draft.minutesContent || '').trim();
      if (!minutesContent) {
        throw new BadRequestException(
          `「${draft.title || draft.key}」纪要正文为空，请补录或取消勾选`,
        );
      }

      const one = await this.writeOneMeeting(
        user,
        college,
        meetingType,
        draft,
        files as Required<typeof files>,
      );
      results.push(one.result);
      for (const u of one.createdUsers) {
        if (!createdUsersAll.some((x) => x.id === u.id)) createdUsersAll.push(u);
      }
    }

    await this.audit.log({
      user,
      action: 'IMPORT_ARCHIVE_BATCH',
      resource: 'Meeting',
      resourceId: results[0]?.meetingId,
      detail: {
        meetingType,
        source: 'meeting-import',
        count: results.length,
        meetingIds: results.map((r) => r.meetingId),
        createdUsers: createdUsersAll,
        note: '历史会议批次导入（线下纪要附件归档，规则 B：仅勾选场次）',
      },
    });

    return {
      meetingType,
      count: results.length,
      summary: {
        total: results.length,
        archived: results.length,
      },
      meetings: results,
      items: results,
      createdUsers: createdUsersAll,
      link: results[0]?.link,
    };
  }

  private async buildDraftFromBundle(
    b: {
      key: string;
      dateKey: string | null;
      scheduledAt: Date | null;
      periodNo: string | null;
      agendaText: string;
      recordText: string;
      minutesText: string;
      alignStatus: MeetingImportDraft['alignStatus'];
      selected: boolean;
    },
    meetingType: ImportMeetingType,
    collegeId: string | null | undefined,
    collegeName: string,
  ): Promise<MeetingImportDraft> {
    const scheduled = b.scheduledAt;
    const location = parseLocation(b.agendaText, b.minutesText, b.recordText);
    const { hostName, recorderName } = parseHostRecorder(
      b.minutesText,
      b.recordText,
    );
    const blocks = parseAttendanceBlocks(
      b.minutesText,
      b.agendaText,
      b.recordText,
    );
    const topics = buildTopics(b.agendaText, b.minutesText, meetingType);
    const minutesContent =
      buildMinutesContent(b.minutesText) ||
      (b.agendaText
        ? `（本场纪要原件缺失，暂以议题表决议摘要归档）\n${topics
            .map((t) => `${t.sortOrder}. ${t.title}\n${t.resolutionSummary}`)
            .join('\n')}`
        : '');

    const people = await this.buildPeopleDraft(
      collegeId,
      blocks,
      hostName,
      recorderName,
    );

    const warnings: string[] = [];
    if (b.alignStatus === 'ok') {
      // fine
    } else if (b.alignStatus === 'partial') {
      warnings.push('记录或纪要有缺失，默认不导入；勾选后将尽力归档');
    } else if (b.alignStatus === 'agenda_only') {
      warnings.push('仅有议题表，缺记录与纪要，默认不导入');
    } else {
      warnings.push('缺少议题表，默认不导入');
    }
    if (!scheduled) warnings.push('未能解析会议时间');
    if (!topics.length) warnings.push('未能解析议题');
    if (!blocks.attend.length) warnings.push('出席名单为空');
    const toCreate = people.filter((p) => p.action === 'create');
    if (toCreate.length) {
      warnings.push(`将新建 ${toCreate.length} 人：${toCreate.map((p) => p.name).join('、')}`);
    }
    if (
      meetingType === 'PARTY_COMMITTEE' &&
      topics.length &&
      !topics.some((t) => t.isFirstTopic)
    ) {
      warnings.push(
        '未识别第一议题；不影响导入，导入后可在会议详情中设置',
      );
    }

    return {
      key: b.key,
      selected: b.selected,
      alignStatus: b.alignStatus,
      periodNo: b.periodNo,
      scheduledAt: scheduled ? scheduled.toISOString() : null,
      location,
      title: guessMeetingTitle(collegeName, scheduled, meetingType, b.periodNo),
      hostName,
      recorderName,
      topics,
      people,
      minutesContent,
      warnings,
      raw: {
        agendaText: b.agendaText,
        recordText: b.recordText,
        minutesText: b.minutesText,
      },
    };
  }

  private async writeOneMeeting(
    user: AuthUser,
    college: { id: string; code: string; name: string },
    meetingType: ImportMeetingType,
    dto: MeetingImportDraft,
    files: {
      agenda: Express.Multer.File;
      record: Express.Multer.File;
      minutes: Express.Multer.File;
    },
  ) {
    const collegeId = college.id;
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const title =
      (dto.title || '').trim() ||
      guessMeetingTitle(college.name, scheduledAt, meetingType, dto.periodNo);
    const hostName = normalizePersonName(dto.hostName || '');
    const recorderName = normalizePersonName(dto.recorderName || '');
    const location = (dto.location || '').trim();
    const minutesContent = (dto.minutesContent || '').trim();

    const memberRoleCode =
      meetingType === 'JOINT_CONFERENCE'
        ? RoleCode.ATTENDEE
        : RoleCode.PARTY_MEMBER;
    const role = await this.prisma.role.findUnique({
      where: { code: memberRoleCode },
    });
    if (!role) {
      throw new BadRequestException(`系统缺少角色 ${memberRoleCode}，请先初始化`);
    }

    const resolvedPw = resolveInitialPassword(undefined);
    const mustChangePassword = allowWeakPassword()
      ? false
      : resolvedPw.mustChangePassword;
    const passwordHash = await hashPassword(resolvedPw.password);
    const createdUsers: Array<{ id: string; username: string; realName: string }> =
      [];

    const result = await this.prisma.$transaction(async (tx) => {
      const resolvedPeople: Array<PartyImportPersonDraft & { userId: string }> =
        [];

      for (const p of dto.people) {
        const name = normalizePersonName(p.name);
        if (!name) continue;
        let userId = p.userId;
        if (p.action === 'link' && userId) {
          const existing = await tx.user.findFirst({
            where: { id: userId, collegeId },
          });
          if (!existing) {
            throw new BadRequestException(`人员「${name}」关联账号无效`);
          }
        } else {
          const hit = await tx.user.findFirst({
            where: { collegeId, realName: name, enabled: true },
          });
          if (hit) {
            userId = hit.id;
          } else {
            const username = await this.nextUsername(tx, college.code, name);
            const created = await tx.user.create({
              data: {
                username,
                passwordHash,
                realName: name,
                title:
                  meetingType === 'JOINT_CONFERENCE'
                    ? '联席会成员（导入）'
                    : name === hostName
                      ? '党委书记（导入）'
                      : '党委委员（导入）',
                collegeId,
                enabled: true,
                mustChangePassword,
                roles: { create: [{ roleId: role.id }] },
              },
            });
            userId = created.id;
            createdUsers.push({
              id: created.id,
              username: created.username,
              realName: created.realName,
            });
          }
        }
        resolvedPeople.push({ ...p, name, userId: userId! });
      }

      let recorderUserId: string | null = null;
      if (recorderName) {
        const inList = resolvedPeople.find((p) => p.name === recorderName);
        if (inList) recorderUserId = inList.userId;
        else {
          const hit = await tx.user.findFirst({
            where: { collegeId, realName: recorderName, enabled: true },
          });
          if (hit) recorderUserId = hit.id;
          else {
            const username = await this.nextUsername(tx, college.code, recorderName);
            const created = await tx.user.create({
              data: {
                username,
                passwordHash,
                realName: recorderName,
                title: '会议记录人（导入）',
                collegeId,
                enabled: true,
                mustChangePassword,
                roles: { create: [{ roleId: role.id }] },
              },
            });
            recorderUserId = created.id;
            createdUsers.push({
              id: created.id,
              username: created.username,
              realName: created.realName,
            });
          }
        }
      }

      const host =
        resolvedPeople.find((p) => p.name === hostName) ||
        resolvedPeople.find((p) => p.status === 'attend');
      const hostUserId = host?.userId || user.sub;
      const proposerId = hostUserId;

      const shouldAttend = resolvedPeople.filter((p) => p.isFormal !== false).length;
      const actualAttend = resolvedPeople.filter((p) => p.status === 'attend').length;

      const mt =
        meetingType === 'JOINT_CONFERENCE'
          ? MeetingType.JOINT_CONFERENCE
          : MeetingType.PARTY_COMMITTEE;

      const composedContent = this.composeMinutes(
        minutesContent,
        location,
        hostName,
        recorderName,
      );

      const createdMeeting = await tx.meeting.create({
        data: {
          collegeId,
          meetingType: mt,
          title,
          periodNo: dto.periodNo || toDateKey(scheduledAt),
          scheduledAt,
          hostUserId,
          status: MeetingStatus.ARCHIVED,
          isMajor: false,
          quorumRatio: 0.5,
          shouldAttend,
          actualAttend,
          canResolve: true,
          attendances: {
            create: resolvedPeople.map((p) => ({
              userId: p.userId,
              isFormal: p.isFormal !== false,
              checkedIn: p.status === 'attend',
              checkedAt: p.status === 'attend' ? scheduledAt || new Date() : null,
              leaveNote:
                p.status === 'leave'
                  ? '请假（历史导入）'
                  : p.status === 'absent'
                    ? '缺席（历史导入）'
                    : p.status === 'avoid'
                      ? '回避（历史导入）'
                      : null,
              leaveAt:
                p.status === 'leave' || p.status === 'absent'
                  ? scheduledAt || new Date()
                  : null,
            })),
          },
          minutes: {
            create: {
              content: composedContent,
              version: 1,
              effectiveAt: scheduledAt || new Date(),
            },
          },
        },
        include: { minutes: true },
      });

      // 线下纪要：将 Word 原件挂到会议纪要附件（与现行「上传线下纪要」一致）
      this.files.normalizeMulterFile(files.minutes);
      this.files.assertAllowed(
        files.minutes.originalname,
        files.minutes.mimetype,
      );
      const minutesDir = this.files.ensureMeetingDir(collegeId, createdMeeting.id);
      const minutesStored = this.files.buildStoredName(files.minutes.originalname);
      writeFileSync(join(minutesDir, minutesStored), files.minutes.buffer);
      const minutesRel = this.files.relativeMeetingPath(
        collegeId,
        createdMeeting.id,
        minutesStored,
      );
      await tx.minutes.update({
        where: { meetingId: createdMeeting.id },
        data: {
          filePath: minutesRel,
          originalName: files.minutes.originalname,
          mimeType: files.minutes.mimetype,
          fileSize: files.minutes.size,
        },
      });

      let sort = 0;
      for (const p of resolvedPeople.filter((x) => x.isFormal !== false)) {
        await tx.rosterMember.upsert({
          where: {
            collegeId_meetingType_userId: {
              collegeId,
              meetingType: mt,
              userId: p.userId,
            },
          },
          create: {
            collegeId,
            meetingType: mt,
            userId: p.userId,
            isFormal: true,
            sortOrder: sort++,
          },
          update: {},
        });
      }

      const evidenceSlots: EvidenceSlot[] = [
        { kind: 'agenda', file: files.agenda },
        { kind: 'record', file: files.record },
      ];

      const firstTopicCategory =
        mt === MeetingType.PARTY_COMMITTEE
          ? await tx.categoryDict.findFirst({
              where: {
                meetingType: MeetingType.PARTY_COMMITTEE,
                code: FIRST_TOPIC_CODE,
              },
            })
          : null;

      // 优先用预览勾选的第一议题；否则按标题关键词识别（不强行把第 1 条当第一议题）
      const topicsForWrite = dto.topics.map((t) => ({
        ...t,
        isFirstTopic: false,
      }));
      if (mt === MeetingType.PARTY_COMMITTEE && topicsForWrite.length) {
        const explicit = dto.topics.findIndex((t) => t.isFirstTopic);
        const auto = topicsForWrite.findIndex((t) =>
          isLikelyFirstTopic(t.title),
        );
        const pick = explicit >= 0 ? explicit : auto;
        if (pick >= 0) topicsForWrite[pick].isFirstTopic = true;
      }
      topicsForWrite.sort(
        (a, b) => Number(Boolean(b.isFirstTopic)) - Number(Boolean(a.isFirstTopic)),
      );

      let selectedFirstTopicId: string | null = null;
      for (const [idx, topicDraft] of topicsForWrite.entries()) {
        const useFirstTopic =
          Boolean(topicDraft.isFirstTopic) && Boolean(firstTopicCategory?.id);
        const topic = await tx.topic.create({
          data: {
            collegeId,
            meetingId: createdMeeting.id,
            meetingType: mt,
            categoryId: useFirstTopic ? firstTopicCategory!.id : undefined,
            title: topicDraft.title.trim(),
            content: [
              topicDraft.minutesSection?.trim() || '',
              '',
              '——',
              `来源：历史${meetingType === 'JOINT_CONFERENCE' ? '党政联席会议' : '党委会'}导入`,
              location ? `会议地点：${location}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
            proposerId,
            status: TopicStatus.RESOLVED,
            sortOrder: idx,
            materials: {
              create:
                idx === 0
                  ? evidenceSlots.map((s) => ({
                      name: this.materialLabel(s.kind, meetingType),
                      requiredKey: `IMPORT_${s.kind.toUpperCase()}`,
                      isRequired: false,
                      uploaded: false,
                      securityLevel: 'INTERNAL',
                    }))
                  : [],
            },
            votes: {
              create: {
                method: VoteMethod.ORAL,
                approve: true,
                voteCounted: true,
                isAbsentOpinion: false,
                userId: null,
              },
            },
            resolution: {
              create: {
                resultType: ResolutionType.APPROVED,
                content:
                  (topicDraft.resolutionSummary || '').trim() ||
                  '会议通过（历史导入，无逐人计票明细）',
                isPublic: false,
                securityLevel: 'INTERNAL',
              },
            },
          },
          include: { materials: true },
        });
        if (topicDraft.isFirstTopic) selectedFirstTopicId = topic.id;

        if (idx === 0 && topic.materials.length) {
          for (const mat of topic.materials) {
            const slot = evidenceSlots.find(
              (s) => mat.requiredKey === `IMPORT_${s.kind.toUpperCase()}`,
            );
            if (!slot) continue;
            this.files.normalizeMulterFile(slot.file);
            this.files.assertAllowed(slot.file.originalname, slot.file.mimetype);
            const dir = this.files.ensureTopicDir(collegeId, topic.id);
            const storedName = this.files.buildStoredName(slot.file.originalname);
            writeFileSync(join(dir, storedName), slot.file.buffer);
            const relativePath = this.files.relativePath(
              collegeId,
              topic.id,
              storedName,
            );
            await tx.material.update({
              where: { id: mat.id },
              data: {
                filePath: relativePath,
                originalName: slot.file.originalname,
                mimeType: slot.file.mimetype,
                fileSize: slot.file.size,
                uploaded: true,
              },
            });
          }
        }
      }

      if (selectedFirstTopicId) {
        await tx.meeting.update({
          where: { id: createdMeeting.id },
          data: { firstTopicId: selectedFirstTopicId },
        });
      }

      return {
        meeting: createdMeeting,
        recorderUserId,
        hostUserId,
      };
    });

    const from =
      meetingType === 'JOINT_CONFERENCE' ? '?from=joint' : '?from=party';
    return {
      createdUsers,
      result: {
        meetingId: result.meeting.id,
        title,
        link: `/meetings/${result.meeting.id}${from}`,
      },
    };
  }

  private composeMinutes(
    content: string,
    location: string,
    hostName: string,
    recorderName: string,
  ) {
    const note =
      '【导入说明】本纪要由历史 Word 原件导入；线下纪要附件已挂载，无需线上签署。';
    if (
      content.includes('会议地点') ||
      content.includes('主持人') ||
      content.includes('出席')
    ) {
      return `${content}\n\n——\n${note}`;
    }
    const header = [
      location ? `会议地点：${location}` : '',
      hostName ? `主持人：${hostName}` : '',
      recorderName ? `记录人：${recorderName}` : '',
      note,
      '',
    ]
      .filter(Boolean)
      .join('\n');
    return `${header}\n${content}`;
  }

  private materialLabel(
    kind: EvidenceSlot['kind'],
    meetingType: ImportMeetingType,
  ) {
    const prefix =
      meetingType === 'JOINT_CONFERENCE' ? '合订本原件' : '历史原件';
    if (kind === 'agenda') return `${prefix}·议题表`;
    return `${prefix}·会议记录`;
  }

  private async resolveCollege(user: AuthUser, hint: string) {
    if (user.collegeId && !user.isSchoolAdmin) {
      return this.prisma.college.findUnique({ where: { id: user.collegeId } });
    }
    if (hint) {
      const byName = await this.prisma.college.findFirst({
        where: { name: { contains: hint.replace(/学院$/, '') } },
      });
      if (byName) return byName;
      const exact = await this.prisma.college.findFirst({
        where: { name: hint },
      });
      if (exact) return exact;
    }
    if (user.collegeId) {
      return this.prisma.college.findUnique({ where: { id: user.collegeId } });
    }
    return null;
  }

  private async buildPeopleDraft(
    collegeId: string | null | undefined,
    blocks: ReturnType<typeof parseAttendanceBlocks>,
    hostName: string,
    recorderName: string,
  ): Promise<PartyImportPersonDraft[]> {
    const order: Array<{
      name: string;
      status: PartyImportPersonDraft['status'];
      isFormal: boolean;
    }> = [];
    const push = (
      name: string,
      status: PartyImportPersonDraft['status'],
      isFormal = true,
    ) => {
      const n = normalizePersonName(name);
      if (!n) return;
      if (order.some((x) => x.name === n)) return;
      order.push({ name: n, status, isFormal });
    };
    for (const n of blocks.attend) push(n, 'attend', true);
    for (const n of blocks.observers || []) push(n, 'attend', false);
    for (const n of blocks.leave) push(n, 'leave', true);
    for (const n of blocks.absent) push(n, 'absent', true);
    for (const n of blocks.avoid) push(n, 'avoid', true);
    if (hostName) push(hostName, 'attend', true);
    void recorderName;

    const collegeUsers = collegeId
      ? await this.prisma.user.findMany({
          where: { collegeId, enabled: true },
          select: { id: true, realName: true, username: true },
        })
      : [];

    return order.map((p) => {
      const hit = collegeUsers.find((u) => u.realName === p.name);
      return {
        name: p.name,
        userId: hit?.id,
        username: hit?.username,
        action: (hit ? 'link' : 'create') as PartyImportPersonDraft['action'],
        isFormal: p.isFormal,
        status: p.status,
      };
    });
  }

  private async nextUsername(
    tx: {
      user: {
        findUnique: (args: {
          where: { username: string };
        }) => Promise<{ id: string } | null>;
      };
    },
    collegeCode: string,
    realName: string,
  ) {
    const base = `imp_${collegeCode}_${realName}`.slice(0, 40);
    let candidate = base;
    let i = 2;
    while (await tx.user.findUnique({ where: { username: candidate } })) {
      candidate = `${base}_${i++}`.slice(0, 48);
    }
    return candidate;
  }
}
