import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { AuthUser } from '../common/types';
import {
  JointReviewSide,
  MeetingStatus,
  MeetingType,
  ResolutionType,
  RoleCode,
  TopicStatus,
  VoteMethod,
} from '../common/constants';
import { assertCollegeVisible, assertAnyRole } from '../common/roles';
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

type UploadSlot = {
  kind: 'agenda' | 'record' | 'minutes';
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
        note: '历史会议批次导入（规则 B：仅勾选场次）',
      },
    });

    return {
      meetingType,
      count: results.length,
      meetings: results,
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

    const passwordHash = await bcrypt.hash('123456', 8);
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

      let deanUserId: string | null = null;
      if (meetingType === 'JOINT_CONFERENCE') {
        const dean = await tx.user.findFirst({
          where: {
            collegeId,
            enabled: true,
            roles: { some: { role: { code: RoleCode.DEAN } } },
          },
        });
        deanUserId = dean?.id || hostUserId;
      }

      const mt =
        meetingType === 'JOINT_CONFERENCE'
          ? MeetingType.JOINT_CONFERENCE
          : MeetingType.PARTY_COMMITTEE;

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
              content: this.composeMinutes(
                minutesContent,
                location,
                hostName,
                recorderName,
              ),
              version: 1,
              effectiveAt: scheduledAt || new Date(),
              signs: {
                create:
                  meetingType === 'JOINT_CONFERENCE'
                    ? [
                        {
                          userId: hostUserId,
                          side: JointReviewSide.SECRETARY,
                          signedAt: scheduledAt || new Date(),
                        },
                        {
                          userId: deanUserId || hostUserId,
                          side: JointReviewSide.DEAN,
                          signedAt: scheduledAt || new Date(),
                        },
                      ]
                    : [
                        {
                          userId: hostUserId,
                          side: JointReviewSide.SECRETARY,
                          signedAt: scheduledAt || new Date(),
                        },
                      ],
              },
            },
          },
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

      const uploadSlots: UploadSlot[] = [
        { kind: 'agenda', file: files.agenda },
        { kind: 'record', file: files.record },
        { kind: 'minutes', file: files.minutes },
      ];

      for (const [idx, topicDraft] of dto.topics.entries()) {
        const topic = await tx.topic.create({
          data: {
            collegeId,
            meetingId: createdMeeting.id,
            meetingType: mt,
            title: topicDraft.title.trim(),
            content: [
              topicDraft.minutesSection?.trim() || '',
              '',
              '——',
              `来源：历史${meetingType === 'JOINT_CONFERENCE' ? '党政联席' : '党组织'}会议导入`,
              location ? `会议地点：${location}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
            proposerId,
            status: TopicStatus.RESOLVED,
            sortOrder: topicDraft.sortOrder || idx + 1,
            materials: {
              create:
                idx === 0
                  ? uploadSlots.map((s) => ({
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

        if (idx === 0 && topic.materials.length) {
          for (const mat of topic.materials) {
            const slot = uploadSlots.find(
              (s) => mat.requiredKey === `IMPORT_${s.kind.toUpperCase()}`,
            );
            if (!slot) continue;
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
    if (content.includes('会议地点') || content.includes('主持人') || content.includes('出席')) {
      return `${content}\n\n——\n【导入说明】本纪要由历史 Word 原件导入，签署记录为归档代签。`;
    }
    const header = [
      location ? `会议地点：${location}` : '',
      hostName ? `主持人：${hostName}` : '',
      recorderName ? `记录人：${recorderName}` : '',
      '【导入说明】本纪要由历史 Word 原件导入，签署记录为归档代签，不代表线上重签。',
      '',
    ]
      .filter(Boolean)
      .join('\n');
    return `${header}\n${content}`;
  }

  private materialLabel(
    kind: UploadSlot['kind'],
    meetingType: ImportMeetingType,
  ) {
    const prefix =
      meetingType === 'JOINT_CONFERENCE' ? '合订本原件' : '历史原件';
    if (kind === 'agenda') return `${prefix}·议题表`;
    if (kind === 'record') return `${prefix}·会议记录`;
    return `${prefix}·会议纪要`;
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
