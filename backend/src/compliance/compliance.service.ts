import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  private async writeLog(params: {
    collegeId?: string | null;
    meetingId?: string | null;
    topicId?: string | null;
    ruleCode: string;
    passed: boolean;
    message: string;
    payload?: unknown;
  }) {
    await this.prisma.complianceLog.create({
      data: {
        collegeId: params.collegeId,
        meetingId: params.meetingId,
        topicId: params.topicId,
        ruleCode: params.ruleCode,
        passed: params.passed,
        message: params.message,
        payload: params.payload ? JSON.stringify(params.payload) : null,
      },
    });
    return { passed: params.passed, ruleCode: params.ruleCode, message: params.message };
  }

  /** 规则：书记院长双审均通过才可入议程 */
  async checkDualReview(topicId: string) {
    const reviews = await this.prisma.jointReview.findMany({ where: { topicId } });
    const secretary = reviews.find((r) => r.side === 'SECRETARY');
    const dean = reviews.find((r) => r.side === 'DEAN');
    const passed =
      secretary?.decision === 'APPROVED' && dean?.decision === 'APPROVED';
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    return this.writeLog({
      collegeId: topic?.collegeId,
      topicId,
      ruleCode: 'RULE_DUAL_REVIEW',
      passed,
      message: passed
        ? '书记、院长双审均已通过'
        : '书记与院长未同时同意，议题应暂缓上会',
      payload: { secretary: secretary?.decision, dean: dean?.decision },
    });
  }

  /** 规则：法定人数（普通半数 / 重大三分之二） */
  async checkQuorum(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return this.writeLog({
        meetingId,
        ruleCode: 'RULE_QUORUM',
        passed: false,
        message: '会议不存在',
      });
    }
    const ratio = meeting.isMajor ? 2 / 3 : 1 / 2;
    const passed =
      meeting.shouldAttend > 0 &&
      meeting.actualAttend / meeting.shouldAttend >= ratio - 1e-9;
    return this.writeLog({
      collegeId: meeting.collegeId,
      meetingId,
      ruleCode: 'RULE_QUORUM',
      passed,
      message: passed
        ? `到会人数达标（${meeting.actualAttend}/${meeting.shouldAttend}，要求≥${meeting.isMajor ? '2/3' : '1/2'}）`
        : `到会人数不足（${meeting.actualAttend}/${meeting.shouldAttend}，要求≥${meeting.isMajor ? '2/3' : '1/2'}）`,
      payload: {
        isMajor: meeting.isMajor,
        shouldAttend: meeting.shouldAttend,
        actualAttend: meeting.actualAttend,
        ratio,
      },
    });
  }

  /** 规则：需党委会前置的议题必须关联决议 */
  async checkPartyPrecheck(topicId: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      return this.writeLog({
        topicId,
        ruleCode: 'RULE_PRECHECK_REQUIRED',
        passed: false,
        message: '议题不存在',
      });
    }
    if (!topic.needPartyPrecheck) {
      return this.writeLog({
        collegeId: topic.collegeId,
        topicId,
        ruleCode: 'RULE_PRECHECK_REQUIRED',
        passed: true,
        message: '前置把关校验通过',
      });
    }
    if (!topic.relatedPartyResolutionId) {
      return this.writeLog({
        collegeId: topic.collegeId,
        topicId,
        ruleCode: 'RULE_PRECHECK_REQUIRED',
        passed: false,
        message: '该议题须党委会先行把关，请关联党委会决议',
      });
    }
    const resolution = await this.prisma.resolution.findUnique({
      where: { id: topic.relatedPartyResolutionId },
      include: { topic: true },
    });
    const valid =
      !!resolution &&
      resolution.topic.collegeId === topic.collegeId &&
      resolution.topic.meetingType === 'PARTY_COMMITTEE' &&
      (resolution.resultType === 'APPROVED' ||
        resolution.resultType === 'PRINCIPLE_APPROVED');
    return this.writeLog({
      collegeId: topic.collegeId,
      topicId,
      ruleCode: 'RULE_PRECHECK_REQUIRED',
      passed: valid,
      message: valid
        ? '前置把关校验通过'
        : '关联的党委会决议无效（须为本院党委会同意/原则同意决议）',
      payload: {
        relatedPartyResolutionId: topic.relatedPartyResolutionId,
        found: !!resolution,
      },
    });
  }

  /** 规则：议题回避名单已登记（表决时强制拦截） */
  async checkAvoidance(topicId: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      return this.writeLog({
        topicId,
        ruleCode: 'RULE_AVOIDANCE',
        passed: false,
        message: '议题不存在',
      });
    }
    let avoidIds: string[] = [];
    try {
      avoidIds = JSON.parse(topic.avoidUserIds || '[]');
    } catch {
      avoidIds = [];
    }
    return this.writeLog({
      collegeId: topic.collegeId,
      topicId,
      ruleCode: 'RULE_AVOIDANCE',
      passed: true,
      message:
        avoidIds.length === 0
          ? '未设置回避人员'
          : `已登记回避人员 ${avoidIds.length} 人，表决时强制拦截`,
      payload: { avoidUserIds: avoidIds },
    });
  }

  /**
   * 规则：临时动议须书记、院长双签同意后方可入会
   * （联席会；党委会临时动议由书记审题覆盖）
   */
  async checkTempMotion(topicId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: { jointReviews: true },
    });
    if (!topic) {
      return this.writeLog({
        topicId,
        ruleCode: 'RULE_TEMP_MOTION',
        passed: false,
        message: '议题不存在',
      });
    }
    if (!topic.isTempMotion) {
      return this.writeLog({
        collegeId: topic.collegeId,
        topicId,
        ruleCode: 'RULE_TEMP_MOTION',
        passed: true,
        message: '非临时动议，跳过专项校验',
      });
    }

    if (topic.meetingType === 'PARTY_COMMITTEE') {
      const secretary = topic.jointReviews.find((r) => r.side === 'SECRETARY');
      const passed = secretary?.decision === 'APPROVED';
      return this.writeLog({
        collegeId: topic.collegeId,
        topicId,
        ruleCode: 'RULE_TEMP_MOTION',
        passed,
        message: passed
          ? '党委会临时动议已获书记同意'
          : '党委会临时动议须经书记审题同意',
        payload: { secretary: secretary?.decision },
      });
    }

    const secretary = topic.jointReviews.find((r) => r.side === 'SECRETARY');
    const dean = topic.jointReviews.find((r) => r.side === 'DEAN');
    const passed =
      secretary?.decision === 'APPROVED' && dean?.decision === 'APPROVED';
    return this.writeLog({
      collegeId: topic.collegeId,
      topicId,
      ruleCode: 'RULE_TEMP_MOTION',
      passed,
      message: passed
        ? '临时动议已获书记、院长双签同意'
        : '无特殊情况不得临时动议；临时议题须书记、院长双人同意',
      payload: { secretary: secretary?.decision, dean: dean?.decision },
    });
  }

  /** 规则：纪要须书记+院长双签 */
  async checkMinutesSign(minutesId: string) {
    const minutes = await this.prisma.minutes.findUnique({
      where: { id: minutesId },
      include: { signs: true, meeting: true },
    });
    if (!minutes) {
      return this.writeLog({
        ruleCode: 'RULE_MINUTE_SIGN',
        passed: false,
        message: '纪要不存在',
      });
    }
    const hasSecretary = minutes.signs.some((s) => s.side === 'SECRETARY');
    const hasDean = minutes.signs.some((s) => s.side === 'DEAN');
    const passed = hasSecretary && hasDean;
    return this.writeLog({
      collegeId: minutes.meeting.collegeId,
      meetingId: minutes.meetingId,
      ruleCode: 'RULE_MINUTE_SIGN',
      passed,
      message: passed ? '纪要双签完成' : '纪要须党委书记、院长双人签字后生效',
    });
  }
}
