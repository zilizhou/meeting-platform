import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/types';
import {
  JointReviewSide,
  MeetingType,
  ReviewDecision,
  RoleCode,
  SupervisionStatus,
  TopicStatus,
} from '../common/constants';
import {
  assertAnyRole,
  canSeeFullTopicLibrary,
  isCollegeVisible,
  prismaCollegeIdFilter,
  PROXY_REVIEW_ROLES,
} from '../common/roles';
import {
  materialsForCategory,
  withEmergencyMaterials,
  withTempMotionMaterials,
} from './material-templates';
import {
  AddMaterialDto,
  ConfirmEmergencyDto,
  CreateTopicDto,
  MaterialReadDto,
  PublishResolutionDto,
  ReviewTopicDto,
  SetAvoidUsersDto,
  UpdateTopicDto,
} from './dto/topic.dto';

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  private requireCollege(user: AuthUser, requestedCollegeId?: string) {
    if (user.collegeId) {
      if (
        requestedCollegeId &&
        requestedCollegeId !== user.collegeId &&
        !user.isSchoolAdmin
      ) {
        throw new ForbiddenException('不能为其他学院创建议题');
      }
      return user.collegeId;
    }
    if (user.isSchoolAdmin) {
      if (!requestedCollegeId) {
        throw new BadRequestException(
          '校级账号未绑定学院，请选择要写入的学院后再提交',
        );
      }
      return requestedCollegeId;
    }
    throw new BadRequestException(
      '当前账号未绑定学院，无法提交议题。请联系管理员绑定所属学院',
    );
  }

  /** 校验关联的党组织会议决议：存在、本院、党组织会议、同意类结果 */
  private async assertValidPartyResolution(
    collegeId: string,
    resolutionId: string,
  ) {
    const resolution = await this.prisma.resolution.findUnique({
      where: { id: resolutionId },
      include: { topic: true },
    });
    if (!resolution) {
      throw new BadRequestException('关联的党组织会议决议不存在');
    }
    if (resolution.topic.collegeId !== collegeId) {
      throw new ForbiddenException('不能关联其他学院的党组织会议决议');
    }
    if (resolution.topic.meetingType !== MeetingType.PARTY_COMMITTEE) {
      throw new BadRequestException('关联决议必须来自党组织会议');
    }
    if (
      resolution.resultType !== 'APPROVED' &&
      resolution.resultType !== 'PRINCIPLE_APPROVED'
    ) {
      throw new BadRequestException('关联决议须为同意或原则同意');
    }
    return resolution;
  }

  async create(user: AuthUser, dto: CreateTopicDto) {
    const collegeId = this.requireCollege(user, dto.collegeId);
    const college = await this.prisma.college.findUnique({
      where: { id: collegeId },
    });
    if (!college) throw new BadRequestException('学院不存在');
    if (!isCollegeVisible(user, collegeId)) {
      throw new ForbiddenException('不能为其他学院创建议题');
    }
    const meetingType = dto.meetingType || MeetingType.JOINT_CONFERENCE;
    const isTempMotion = dto.isTempMotion ?? false;
    const isEmergency = dto.isEmergency ?? false;

    if (meetingType === MeetingType.JOINT_CONFERENCE) {
      if (dto.needPartyPrecheck && !dto.relatedPartyResolutionId) {
        throw new BadRequestException('需党组织会议前置的议题必须关联党组织会议决议');
      }
    }

    if (isEmergency && meetingType !== MeetingType.JOINT_CONFERENCE) {
      throw new BadRequestException('紧急临机处置仅适用于党政联席会议题');
    }

    let categoryCode: string | null = null;
    let needPartyPrecheck = dto.needPartyPrecheck ?? false;
    if (dto.categoryId) {
      const category = await this.prisma.categoryDict.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new BadRequestException('议题分类不存在');
      if (category.meetingType !== meetingType) {
        throw new BadRequestException('议题分类与会议类型不匹配');
      }
      categoryCode = category.code;
      if (category.needPrecheck) needPartyPrecheck = true;
    }

    if (
      meetingType === MeetingType.JOINT_CONFERENCE &&
      needPartyPrecheck &&
      !dto.relatedPartyResolutionId
    ) {
      throw new BadRequestException('需党组织会议前置的议题必须关联党组织会议决议');
    }

    if (dto.relatedPartyResolutionId) {
      await this.assertValidPartyResolution(
        collegeId,
        dto.relatedPartyResolutionId,
      );
    }

    const defaultMaterials = withEmergencyMaterials(
      withTempMotionMaterials(
        materialsForCategory(meetingType, categoryCode),
        isTempMotion,
      ),
      isEmergency,
    );

    const topic = await this.prisma.topic.create({
      data: {
        collegeId,
        meetingType,
        title: dto.title,
        content: dto.content,
        categoryId: dto.categoryId,
        proposerId: user.sub,
        status: TopicStatus.DRAFT,
        needPartyPrecheck,
        relatedPartyResolutionId: dto.relatedPartyResolutionId,
        isMajor: dto.isMajor ?? false,
        isTempMotion,
        isEmergency,
        materials: { create: defaultMaterials },
      },
      include: { materials: true, category: true },
    });

    await this.audit.log({
      user,
      action: 'CREATE',
      resource: 'Topic',
      resourceId: topic.id,
      detail: {
        title: topic.title,
        meetingType,
        isTempMotion,
        isEmergency,
      },
    });

    return topic;
  }

  private isTopicAdmin(user: AuthUser) {
    return Boolean(
      user.isSchoolAdmin || user.roles?.includes(RoleCode.COLLEGE_ADMIN),
    );
  }

  /** 议题库中「修改/删除」权限：本人提交，或学院/学校管理员 */
  private assertCanManage(user: AuthUser, topic: { collegeId: string; proposerId: string }) {
    if (!isCollegeVisible(user, topic.collegeId)) {
      throw new ForbiddenException('无权操作该议题');
    }
    const isAdmin = this.isTopicAdmin(user);
    const isOwner = topic.proposerId === user.sub;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('只能修改/删除本人提交的议题');
    }
    return { isAdmin, isOwner };
  }

  async update(user: AuthUser, id: string, dto: UpdateTopicDto) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException('议题不存在');
    const { isAdmin } = this.assertCanManage(user, topic);

    const lockedStatuses: string[] = [
      TopicStatus.ON_AGENDA,
      TopicStatus.DISCUSSED,
      TopicStatus.RESOLVED,
    ];
    if (!isAdmin && lockedStatuses.includes(topic.status)) {
      throw new BadRequestException('议题已上会，暂不可修改，请联系管理员处理');
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.isMajor !== undefined) data.isMajor = dto.isMajor;
    if (dto.isTempMotion !== undefined) data.isTempMotion = dto.isTempMotion;
    if (dto.isEmergency !== undefined) {
      if (dto.isEmergency && topic.meetingType !== MeetingType.JOINT_CONFERENCE) {
        throw new BadRequestException('紧急临机处置仅适用于党政联席会议题');
      }
      data.isEmergency = dto.isEmergency;
    }

    let needPartyPrecheck =
      dto.needPartyPrecheck !== undefined
        ? dto.needPartyPrecheck
        : topic.needPartyPrecheck;
    let newCategoryCode: string | null = null;

    if (dto.categoryId !== undefined && dto.categoryId !== topic.categoryId) {
      if (dto.categoryId) {
        const category = await this.prisma.categoryDict.findUnique({
          where: { id: dto.categoryId },
        });
        if (!category) throw new BadRequestException('议题分类不存在');
        if (category.meetingType !== topic.meetingType) {
          throw new BadRequestException('议题分类与会议类型不匹配');
        }
        data.categoryId = category.id;
        newCategoryCode = category.code;
        if (category.needPrecheck) needPartyPrecheck = true;
      } else {
        data.categoryId = null;
      }
    }

    const relatedId =
      dto.relatedPartyResolutionId !== undefined
        ? dto.relatedPartyResolutionId
        : topic.relatedPartyResolutionId;
    if (
      topic.meetingType === MeetingType.JOINT_CONFERENCE &&
      needPartyPrecheck &&
      !relatedId
    ) {
      throw new BadRequestException('需党组织会议前置的议题必须关联党组织会议决议');
    }
    if (dto.relatedPartyResolutionId) {
      await this.assertValidPartyResolution(
        topic.collegeId,
        dto.relatedPartyResolutionId,
      );
    }
    if (dto.relatedPartyResolutionId !== undefined) {
      data.relatedPartyResolutionId = dto.relatedPartyResolutionId || null;
    }
    data.needPartyPrecheck = needPartyPrecheck;

    await this.prisma.topic.update({ where: { id }, data });

    if (newCategoryCode) {
      const current = await this.prisma.material.findMany({ where: { topicId: id } });
      const existingKeys = new Set(
        current.map((m) => m.requiredKey).filter(Boolean) as string[],
      );
      const template = materialsForCategory(topic.meetingType, newCategoryCode);
      const toAdd = template.filter((t) => !existingKeys.has(t.requiredKey));
      if (toAdd.length) {
        await this.prisma.material.createMany({
          data: toAdd.map((t) => ({
            topicId: id,
            name: t.name,
            requiredKey: t.requiredKey,
            isRequired: t.isRequired,
          })),
        });
      }
    }

    await this.audit.log({
      user,
      action: 'UPDATE',
      resource: 'Topic',
      resourceId: id,
      detail: { fields: Object.keys(data) },
    });

    return this.detail(user, id);
  }

  async remove(user: AuthUser, id: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException('议题不存在');
    const { isAdmin } = this.assertCanManage(user, topic);

    const lockedStatuses: string[] = [
      TopicStatus.ON_AGENDA,
      TopicStatus.DISCUSSED,
      TopicStatus.RESOLVED,
    ];
    if (!isAdmin && (topic.meetingId || lockedStatuses.includes(topic.status))) {
      throw new BadRequestException('议题已上会，暂不可删除，请联系管理员处理');
    }

    await this.prisma.topic.delete({ where: { id } });

    await this.audit.log({
      user,
      action: 'DELETE',
      resource: 'Topic',
      resourceId: id,
      detail: { title: topic.title, meetingType: topic.meetingType },
    });

    return { id, deleted: true };
  }

  private relatedTopicWhere(user: AuthUser) {
    return {
      OR: [
        { proposerId: user.sub },
        { meeting: { attendances: { some: { userId: user.sub } } } },
        {
          resolution: {
            supervisionTasks: { some: { ownerId: user.sub } },
          },
        },
      ],
    };
  }

  async list(user: AuthUser, meetingType?: string) {
    const visibility = canSeeFullTopicLibrary(user)
      ? {}
      : this.relatedTopicWhere(user);
    return this.prisma.topic.findMany({
      where: {
        ...prismaCollegeIdFilter(user),
        ...(meetingType ? { meetingType } : {}),
        ...visibility,
      },
      include: {
        proposer: { select: { id: true, realName: true } },
        category: true,
        jointReviews: true,
        resolution: true,
        transferTo: true,
        transferFrom: { include: { sourceTopic: { select: { id: true, title: true } } } },
        meeting: {
          select: { id: true, status: true, title: true, periodNo: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(user: AuthUser, id: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id },
      include: {
        materials: {
          include: {
            receipts: {
              include: {
                user: { select: { id: true, realName: true, title: true } },
              },
              orderBy: { readAt: 'desc' },
            },
          },
        },
        jointReviews: { include: { reviewer: { select: { id: true, realName: true } } } },
        proposer: { select: { id: true, realName: true } },
        category: true,
        resolution: true,
        discussions: true,
        votes: true,
        transferTo: { include: { targetTopic: { select: { id: true, title: true, status: true } } } },
        transferFrom: {
          include: {
            sourceTopic: {
              select: { id: true, title: true, status: true, resolution: true },
            },
          },
        },
      },
    });
    if (!topic) throw new NotFoundException('议题不存在');
    if (!isCollegeVisible(user, topic.collegeId)) {
      throw new ForbiddenException('无权查看');
    }
    if (!canSeeFullTopicLibrary(user)) {
      const related = await this.prisma.topic.findFirst({
        where: { id: topic.id, ...this.relatedTopicWhere(user) },
        select: { id: true },
      });
      if (!related) {
        throw new ForbiddenException('无权查看该议题');
      }
    }

    const avoidIds: string[] = (() => {
      try {
        return JSON.parse(topic.avoidUserIds || '[]');
      } catch {
        return [];
      }
    })();
    const avoidUsers =
      avoidIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: avoidIds } },
            select: { id: true, realName: true, title: true, username: true },
          });

    const materials = topic.materials.map((m) => ({
      ...m,
      receiptCount: m.receipts.length,
      myReadAt: m.receipts.find((r) => r.userId === user.sub)?.readAt ?? null,
    }));

    let emergencyConfirmSideList: string[] = [];
    try {
      emergencyConfirmSideList = JSON.parse(topic.emergencyConfirmSides || '[]');
    } catch {
      emergencyConfirmSideList = [];
    }

    return {
      ...topic,
      materials,
      avoidUserIdList: avoidIds,
      avoidUsers,
      emergencyConfirmSideList,
      emergencyConfirmed:
        emergencyConfirmSideList.includes('SECRETARY') &&
        emergencyConfirmSideList.includes('DEAN'),
    };
  }

  async markMaterialRead(user: AuthUser, materialId: string, dto: MaterialReadDto) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { topic: true },
    });
    if (!material) throw new NotFoundException('材料不存在');
    if (!isCollegeVisible(user, material.topic.collegeId)) {
      throw new ForbiddenException();
    }
    if (!material.uploaded) {
      throw new BadRequestException('材料尚未上传，无法阅件回执');
    }

    const receipt = await this.prisma.materialReadReceipt.upsert({
      where: {
        materialId_userId: { materialId, userId: user.sub },
      },
      create: {
        materialId,
        userId: user.sub,
        note: dto.note?.trim() || null,
      },
      update: {
        readAt: new Date(),
        note: dto.note?.trim() || null,
      },
    });

    await this.audit.log({
      user,
      action: 'READ_RECEIPT',
      resource: 'Material',
      resourceId: materialId,
      detail: { topicId: material.topicId },
    });

    return receipt;
  }

  async setAvoidUsers(user: AuthUser, topicId: string, dto: SetAvoidUsersDto) {
    const topic = await this.detail(user, topicId);
    const canEdit =
      user.roles.includes(RoleCode.MEETING_SECRETARY) ||
      user.roles.includes(RoleCode.COLLEGE_ADMIN) ||
      user.roles.includes(RoleCode.SECRETARY) ||
      user.roles.includes(RoleCode.DEAN) ||
      user.isSchoolAdmin ||
      topic.proposerId === user.sub;
    if (!canEdit) throw new ForbiddenException('无权设置回避名单');

    const uniqueIds = [...new Set(dto.userIds || [])];
    if (uniqueIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uniqueIds } },
      });
      if (users.length !== uniqueIds.length) {
        throw new BadRequestException('回避名单含无效用户');
      }
      for (const u of users) {
        if (u.collegeId && u.collegeId !== topic.collegeId) {
          throw new BadRequestException('只能设置本院用户回避');
        }
      }
    }

    await this.prisma.topic.update({
      where: { id: topicId },
      data: { avoidUserIds: JSON.stringify(uniqueIds) },
    });
    await this.compliance.checkAvoidance(topicId);
    await this.audit.log({
      user,
      action: 'SET_AVOID_USERS',
      resource: 'Topic',
      resourceId: topicId,
      detail: { userIds: uniqueIds },
    });
    return this.detail(user, topicId);
  }

  async addMaterial(user: AuthUser, topicId: string, dto: AddMaterialDto) {
    const topic = await this.detail(user, topicId);
    if (![TopicStatus.DRAFT, TopicStatus.PENDING_REVIEW, TopicStatus.DEFERRED].includes(topic.status as any)) {
      throw new BadRequestException('当前状态不可补充材料');
    }
    return this.prisma.material.create({
      data: {
        topicId,
        name: dto.name,
        requiredKey: dto.requiredKey,
        isRequired: dto.isRequired ?? false,
        uploaded: false,
        filePath: null,
      },
    });
  }

  async uploadMaterialFile(
    user: AuthUser,
    materialId: string,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    this.files.normalizeMulterFile(file);
    this.files.assertAllowed(file.originalname, file.mimetype);

    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { topic: true },
    });
    if (!material) throw new NotFoundException('材料不存在');
    if (!isCollegeVisible(user, material.topic.collegeId)) {
      throw new ForbiddenException();
    }
    if (
      ![TopicStatus.DRAFT, TopicStatus.PENDING_REVIEW, TopicStatus.DEFERRED].includes(
        material.topic.status as any,
      )
    ) {
      throw new BadRequestException('当前议题状态不可更换材料');
    }

    const dir = this.files.ensureTopicDir(
      material.topic.collegeId,
      material.topicId,
    );
    const storedName = this.files.buildStoredName(file.originalname);
    const absPath = join(dir, storedName);
    writeFileSync(absPath, file.buffer);

    // 替换旧文件
    if (material.filePath) {
      try {
        const oldAbs = this.files.absolutePath(material.filePath);
        if (existsSync(oldAbs)) unlinkSync(oldAbs);
      } catch {
        // ignore cleanup errors
      }
    }

    const relativePath = this.files.relativePath(
      material.topic.collegeId,
      material.topicId,
      storedName,
    );

    const updated = await this.prisma.material.update({
      where: { id: materialId },
      data: {
        filePath: relativePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploaded: true,
      },
    });

    await this.audit.log({
      user,
      action: 'UPLOAD',
      resource: 'Material',
      resourceId: materialId,
      detail: {
        originalName: file.originalname,
        size: file.size,
        path: relativePath,
      },
    });

    return updated;
  }

  async downloadMaterial(user: AuthUser, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { topic: true },
    });
    if (!material) throw new NotFoundException('材料不存在');
    if (!isCollegeVisible(user, material.topic.collegeId)) {
      throw new ForbiddenException();
    }
    if (!material.filePath || !material.uploaded) {
      throw new NotFoundException('文件尚未上传');
    }

    const abs = this.files.absolutePath(material.filePath);
    if (!existsSync(abs)) throw new NotFoundException('文件不存在或已被删除');

    await this.audit.log({
      user,
      action: 'DOWNLOAD',
      resource: 'Material',
      resourceId: materialId,
      detail: {
        topicId: material.topicId,
        name: material.originalName || material.name,
      },
    });

    const stream = createReadStream(abs);
    const filename = encodeURIComponent(
      this.files.decodeOriginalName(material.originalName || material.name || 'file'),
    );
    return {
      file: new StreamableFile(stream),
      filename,
      mimeType: material.mimeType || 'application/octet-stream',
    };
  }

  /** 提交审题：联席会走书记+院长双审；党组织会议走书记初审 */
  async submitForReview(user: AuthUser, topicId: string) {
    const topic = await this.detail(user, topicId);
    if (topic.meetingType === MeetingType.JOINT_CONFERENCE && topic.needPartyPrecheck) {
      const pre = await this.compliance.checkPartyPrecheck(topicId);
      if (!pre.passed) throw new BadRequestException(pre.message);
    }

    const collegeUsers = await this.prisma.user.findMany({
      where: { collegeId: topic.collegeId },
      include: { roles: { include: { role: true } } },
    });
    const secretary = collegeUsers.find((u) =>
      u.roles.some((r) => r.role.code === RoleCode.SECRETARY),
    );
    if (!secretary) {
      throw new BadRequestException('学院未配置党委书记角色账号');
    }

    if (topic.meetingType === MeetingType.PARTY_COMMITTEE) {
      await this.prisma.$transaction([
        this.prisma.jointReview.deleteMany({ where: { topicId } }),
        this.prisma.jointReview.create({
          data: {
            topicId,
            side: JointReviewSide.SECRETARY,
            reviewerId: secretary.id,
            decision: ReviewDecision.PENDING,
          },
        }),
        this.prisma.topic.update({
          where: { id: topicId },
          data: { status: TopicStatus.PENDING_REVIEW },
        }),
      ]);
      await this.audit.log({
        user,
        action: 'SUBMIT_PARTY_REVIEW',
        resource: 'Topic',
        resourceId: topicId,
      });
      await this.notifications.notify({
        userId: secretary.id,
        collegeId: topic.collegeId,
        type: 'PARTY_REVIEW',
        title: `党组织会议议题待审：${topic.title}`,
        content: '请登录系统完成书记审题',
        link: `/topics/${topicId}?from=party`,
      });
      return this.detail(user, topicId);
    }

    const dean = collegeUsers.find((u) =>
      u.roles.some((r) => r.role.code === RoleCode.DEAN),
    );
    if (!dean) {
      throw new BadRequestException('学院未配置院长角色账号');
    }

    await this.prisma.$transaction([
      this.prisma.jointReview.deleteMany({ where: { topicId } }),
      this.prisma.jointReview.createMany({
        data: [
          {
            topicId,
            side: JointReviewSide.SECRETARY,
            reviewerId: secretary.id,
            decision: ReviewDecision.PENDING,
          },
          {
            topicId,
            side: JointReviewSide.DEAN,
            reviewerId: dean.id,
            decision: ReviewDecision.PENDING,
          },
        ],
      }),
      this.prisma.topic.update({
        where: { id: topicId },
        data: { status: TopicStatus.PENDING_REVIEW },
      }),
    ]);

    await this.audit.log({
      user,
      action: 'SUBMIT_REVIEW',
      resource: 'Topic',
      resourceId: topicId,
    });
    await this.notifications.notifyMany([
      {
        userId: secretary.id,
        collegeId: topic.collegeId,
        type: 'JOINT_REVIEW',
        title: `联席会议题待审：${topic.title}`,
        content: '请完成书记联审',
        link: `/topics/${topicId}`,
      },
      {
        userId: dean.id,
        collegeId: topic.collegeId,
        type: 'JOINT_REVIEW',
        title: `联席会议题待审：${topic.title}`,
        content: '请完成院长联审',
        link: `/topics/${topicId}`,
      },
    ]);
    return this.detail(user, topicId);
  }

  async review(user: AuthUser, topicId: string, dto: ReviewTopicDto) {
    const topic = await this.detail(user, topicId);
    if (topic.status !== TopicStatus.PENDING_REVIEW && topic.status !== TopicStatus.DEFERRED) {
      throw new BadRequestException('议题不在待审状态');
    }

    const isProxy = !!dto.proxy;
    if (isProxy) {
      assertAnyRole(
        user,
        [...PROXY_REVIEW_ROLES],
        '仅学院管理员/会议秘书可代审',
      );
      if (!dto.proxyMethod || !dto.proxyCounterparty?.trim()) {
        throw new BadRequestException('代审须填写确认方式与对方姓名');
      }
    }

    const methodLabel =
      dto.proxyMethod === 'PHONE'
        ? '电话确认'
        : dto.proxyMethod === 'IN_PERSON'
          ? '当面确认'
          : '';
    const comment = isProxy
      ? `[代审·${methodLabel}·${dto.proxyCounterparty!.trim()}]${
          dto.comment ? ` ${dto.comment}` : ''
        }`
      : dto.comment;

    const isCollegeAdmin =
      user.isSchoolAdmin || user.roles.includes(RoleCode.COLLEGE_ADMIN);
    const isSecretary = user.roles.includes(RoleCode.SECRETARY);
    const isDean = user.roles.includes(RoleCode.DEAN);

    let sides: string[];
    if (topic.meetingType === MeetingType.PARTY_COMMITTEE) {
      if (!isProxy && !isSecretary && !isCollegeAdmin) {
        throw new ForbiddenException('仅党委书记或学院管理员可审党组织会议议题');
      }
      sides = [JointReviewSide.SECRETARY];
    } else if (isProxy) {
      if (
        dto.proxySide !== JointReviewSide.SECRETARY &&
        dto.proxySide !== JointReviewSide.DEAN
      ) {
        throw new BadRequestException('联席会议题代审须指定书记或院长一侧');
      }
      sides = [dto.proxySide];
    } else if (isSecretary || isDean) {
      sides = [
        isSecretary ? JointReviewSide.SECRETARY : JointReviewSide.DEAN,
      ];
    } else if (isCollegeAdmin) {
      sides = [JointReviewSide.SECRETARY, JointReviewSide.DEAN];
    } else {
      throw new ForbiddenException('仅党委书记、院长或学院管理员可联审');
    }

    for (const side of sides) {
      await this.prisma.jointReview.upsert({
        where: { topicId_side: { topicId, side } },
        create: {
          topicId,
          side,
          reviewerId: user.sub,
          decision: dto.decision,
          comment,
          decidedAt: new Date(),
        },
        update: {
          reviewerId: user.sub,
          decision: dto.decision,
          comment,
          decidedAt: new Date(),
        },
      });
    }
    const side = sides.join(',');

    let nextStatus: string;
    if (topic.meetingType === MeetingType.PARTY_COMMITTEE) {
      nextStatus =
        dto.decision === ReviewDecision.APPROVED
          ? TopicStatus.APPROVED
          : TopicStatus.DEFERRED;
    } else {
      const check = await this.compliance.checkDualReview(topicId);
      nextStatus = TopicStatus.PENDING_REVIEW;
      if (dto.decision === ReviewDecision.REJECTED) {
        nextStatus = TopicStatus.DEFERRED;
      } else if (check.passed) {
        nextStatus = TopicStatus.APPROVED;
      } else {
        const reviews = await this.prisma.jointReview.findMany({
          where: { topicId },
        });
        if (reviews.some((r) => r.decision === ReviewDecision.REJECTED)) {
          nextStatus = TopicStatus.DEFERRED;
        }
      }
    }

    await this.prisma.topic.update({
      where: { id: topicId },
      data: { status: nextStatus },
    });

    await this.audit.log({
      user,
      action: isProxy
        ? 'PROXY_REVIEW'
        : topic.meetingType === MeetingType.PARTY_COMMITTEE
          ? 'PARTY_REVIEW'
          : 'JOINT_REVIEW',
      resource: 'Topic',
      resourceId: topicId,
      detail: {
        side,
        decision: dto.decision,
        nextStatus,
        ...(isProxy
          ? {
              proxy: true,
              proxyMethod: dto.proxyMethod,
              proxyCounterparty: dto.proxyCounterparty,
            }
          : {}),
      },
    });
    return this.detail(user, topicId);
  }

  /**
   * 党组织会议形成决议；可选自动转联席会（生成联席会议题草稿并建立流转链路）
   */
  async partyResolve(
    user: AuthUser,
    topicId: string,
    dto: import('./dto/topic.dto').PartyResolveDto,
  ) {
    const topic = await this.detail(user, topicId);
    if (topic.meetingType !== MeetingType.PARTY_COMMITTEE) {
      throw new BadRequestException('仅党组织会议议题可使用本接口形成决议');
    }
    if (!user.roles.includes(RoleCode.SECRETARY) && !user.isSchoolAdmin) {
      throw new ForbiddenException('仅党委书记可形成党组织会议决议');
    }
    if (topic.status !== TopicStatus.APPROVED && topic.status !== TopicStatus.ON_AGENDA) {
      throw new BadRequestException('须经党委书记审题通过后方可形成决议');
    }
    if (topic.resolution) {
      throw new BadRequestException('该议题已形成决议');
    }

    const resolution = await this.prisma.resolution.create({
      data: {
        topicId,
        resultType: dto.resultType,
        content: dto.content,
      },
    });

    const passed =
      dto.resultType === 'APPROVED' || dto.resultType === 'PRINCIPLE_APPROVED';
    await this.prisma.topic.update({
      where: { id: topicId },
      data: {
        status: passed
          ? TopicStatus.RESOLVED
          : dto.resultType === 'REJECTED'
            ? TopicStatus.REJECTED
            : TopicStatus.DISCUSSED,
      },
    });

    if (passed) {
      const ownerId = dto.ownerId || user.sub;
      if (dto.ownerId) {
        const owner = await this.prisma.user.findUnique({
          where: { id: dto.ownerId },
        });
        if (!owner) {
          throw new BadRequestException('督办责任人不存在');
        }
        if (!user.isSchoolAdmin && owner.collegeId !== topic.collegeId) {
          throw new ForbiddenException('督办责任人须为本院用户');
        }
      }
      await this.prisma.supervisionTask.create({
        data: {
          resolutionId: resolution.id,
          title: `督办：${topic.title}`,
          ownerId,
          status: SupervisionStatus.PENDING,
          dueAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        },
      });
      await this.notifications.notify({
        userId: ownerId,
        collegeId: topic.collegeId,
        type: 'SUPERVISION',
        title: `督办待办：${topic.title}`,
        content: '党组织会议决议已形成，请及时反馈落实情况',
        link: '/supervisions',
      });
    }

    let transfer: { targetTopicId: string } | null = null;
    if (passed && dto.transferToJoint) {
      transfer = await this.transferPartyToJoint(user, topicId, resolution.id, dto.content);
    }

    await this.audit.log({
      user,
      action: 'PARTY_RESOLVE',
      resource: 'Topic',
      resourceId: topicId,
      detail: {
        resultType: dto.resultType,
        transferToJoint: Boolean(dto.transferToJoint),
        targetTopicId: transfer?.targetTopicId,
      },
    });

    return this.detail(user, topicId);
  }

  /** 将已决议的党组织会议议题转为联席会议题（前置把关链路） */
  async transferPartyToJoint(
    user: AuthUser,
    sourceTopicId: string,
    resolutionId?: string,
    note?: string,
  ) {
    const source = await this.detail(user, sourceTopicId);
    if (source.meetingType !== MeetingType.PARTY_COMMITTEE) {
      throw new BadRequestException('仅党组织会议议题可转联席会');
    }
    const resolution = source.resolution;
    if (!resolution && !resolutionId) {
      throw new BadRequestException('请先形成党组织会议决议再转联席会');
    }
    const resId = resolution?.id || resolutionId!;

    const existing = await this.prisma.transferLink.findUnique({
      where: { sourceTopicId },
    });
    if (existing) {
      throw new BadRequestException('该议题已转联席会，请勿重复操作');
    }

    const transferCategory = await this.prisma.categoryDict.findFirst({
      where: {
        meetingType: MeetingType.JOINT_CONFERENCE,
        code: 'PARTY_TRANSFER',
        OR: [{ collegeId: null }, { collegeId: source.collegeId }],
      },
    });

    const target = await this.prisma.topic.create({
      data: {
        collegeId: source.collegeId,
        meetingType: MeetingType.JOINT_CONFERENCE,
        title: `【党委转办】${source.title}`,
        content: `源自党组织会议决议。${note || resolution?.content || ''}`,
        categoryId: transferCategory?.id,
        proposerId: user.sub,
        status: TopicStatus.DRAFT,
        needPartyPrecheck: true,
        relatedPartyResolutionId: resId,
        isMajor: source.isMajor,
        materials: {
          create: [
            {
              name: '党组织会议决议摘要/依据',
              requiredKey: 'party_resolution',
              isRequired: false,
              uploaded: true,
              filePath: `party-resolution://${resId}`,
              originalName: '党组织会议决议关联',
            },
            {
              name: '调研报告/落实方案',
              requiredKey: 'survey',
              isRequired: false,
            },
          ],
        },
      },
    });

    await this.prisma.transferLink.create({
      data: {
        sourceTopicId,
        targetTopicId: target.id,
        sourceResolutionNote: note || resolution?.content || null,
      },
    });

    await this.compliance.checkPartyPrecheck(target.id);

    const secretaries = await this.prisma.user.findMany({
      where: {
        collegeId: source.collegeId,
        roles: { some: { role: { code: RoleCode.MEETING_SECRETARY } } },
      },
      select: { id: true },
    });
    await this.notifications.notifyMany(
      secretaries.map((s) => ({
        userId: s.id,
        collegeId: source.collegeId,
        type: 'TRANSFER',
        title: `党委转办联席会：${source.title}`,
        content: '已生成联席会议题草稿，请完善材料后提交双审。',
        link: `/topics/${target.id}`,
      })),
    );

    await this.audit.log({
      user,
      action: 'TRANSFER_TO_JOINT',
      resource: 'Topic',
      resourceId: sourceTopicId,
      detail: { targetTopicId: target.id, resolutionId: resId },
    });

    return { targetTopicId: target.id };
  }

  /**
   * 紧急临机处置事后补确认（规则第十三条）：
   * 须已形成决议，并由书记+院长双签确认（与会前双审记录分离）。
   */
  async confirmEmergency(
    user: AuthUser,
    topicId: string,
    dto: ConfirmEmergencyDto,
  ) {
    const topic = await this.detail(user, topicId);
    if (!topic.isEmergency) {
      throw new BadRequestException('该议题非紧急临机处置');
    }
    if (topic.meetingType !== MeetingType.JOINT_CONFERENCE) {
      throw new BadRequestException('仅联席会紧急临机处置需补确认');
    }
    if (!topic.resolution) {
      throw new BadRequestException('请先形成决议再补确认');
    }

    const canConfirm =
      user.isSchoolAdmin ||
      user.roles.includes(RoleCode.SECRETARY) ||
      user.roles.includes(RoleCode.DEAN);
    if (!canConfirm) {
      throw new ForbiddenException('仅书记或院长可补确认紧急临机处置');
    }

    const side = user.roles.includes(RoleCode.SECRETARY)
      ? JointReviewSide.SECRETARY
      : JointReviewSide.DEAN;

    let sides: string[] = [];
    try {
      sides = JSON.parse(topic.emergencyConfirmSides || '[]');
    } catch {
      sides = [];
    }
    if (!sides.includes(side)) sides.push(side);

    await this.prisma.topic.update({
      where: { id: topicId },
      data: {
        emergencyConfirmSides: JSON.stringify(sides),
      },
    });

    const confirmed =
      sides.includes(JointReviewSide.SECRETARY) &&
      sides.includes(JointReviewSide.DEAN);

    await this.audit.log({
      user,
      action: 'CONFIRM_EMERGENCY',
      resource: 'Topic',
      resourceId: topicId,
      detail: { side, confirmed, sides, note: dto.note },
    });

    return {
      side,
      sides,
      confirmed,
      note: dto.note || null,
      message: confirmed
        ? '紧急临机处置已获书记、院长双签补确认'
        : `${side === 'SECRETARY' ? '书记' : '院长'}已补确认，待另一方确认`,
    };
  }

  async publishResolution(
    user: AuthUser,
    topicId: string,
    dto: PublishResolutionDto,
  ) {
    const topic = await this.detail(user, topicId);
    if (!topic.resolution) {
      throw new BadRequestException('议题尚未形成决议');
    }
    const canPublish =
      user.isSchoolAdmin ||
      user.roles.includes(RoleCode.SECRETARY) ||
      user.roles.includes(RoleCode.DEAN) ||
      user.roles.includes(RoleCode.MEETING_SECRETARY) ||
      user.roles.includes(RoleCode.COLLEGE_ADMIN);
    if (!canPublish) {
      throw new ForbiddenException('无权设置决议公开属性');
    }

    const securityLevel =
      dto.securityLevel || (dto.isPublic ? 'PUBLIC' : 'INTERNAL');
    if (dto.isPublic && securityLevel === 'SECRET') {
      throw new BadRequestException('涉密决议不可标记为公开');
    }

    const resolution = await this.prisma.resolution.update({
      where: { id: topic.resolution.id },
      data: {
        isPublic: dto.isPublic,
        securityLevel,
      },
    });

    await this.audit.log({
      user,
      action: 'PUBLISH_RESOLUTION',
      resource: 'Resolution',
      resourceId: resolution.id,
      detail: { isPublic: dto.isPublic, securityLevel },
    });

    return resolution;
  }
}
