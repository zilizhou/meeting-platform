import { Injectable, StreamableFile } from '@nestjs/common';
import { PassThrough } from 'stream';
import { AuthUser } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { AdminService, toCsv } from './admin.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver');

@Injectable()
export class InspectionExportService {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  async exportZip(user: AuthUser, collegeId?: string): Promise<{
    file: StreamableFile;
    filename: string;
  }> {
    const data = await this.admin.buildInspectionPackData(user, collegeId);
    const pass = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: Error) => pass.destroy(err));
    archive.pipe(pass);

    const readme = [
      '曲阜师范大学二级学院双会议一体化管理系统 — 巡视材料包',
      `导出时间：${data.exportedAt}`,
      `导出范围：${data.scope === 'ALL' ? '全校' : data.scope}`,
      `导出人：${user.realName || user.username}`,
      '',
      '目录说明：',
      '01-总览与说明/README.txt',
      '02-学院对比.csv',
      '03-会议台账.csv',
      '04-督办台账.csv',
      '05-合规校验日志.csv',
      '06-转办链路.csv',
      '07-预警汇总.json',
      '08-抽样会议全宗/  （最近最多5场会议的完整留痕 JSON）',
      '',
      '制度依据：曲师大委字〔2021〕20号《学院党政联席会议议事规则》',
    ].join('\n');

    archive.append(readme, { name: '01-总览与说明/README.txt' });
    archive.append(JSON.stringify(data.overview, null, 2), {
      name: '01-总览与说明/overview.json',
    });

    archive.append(
      toCsv(
        data.colleges.map((c) => ({
          学院代码: c.code,
          学院名称: c.name,
          会议数: c.meetingCount,
          党组织会议议题: c.partyTopics,
          联席会议题: c.jointTopics,
          转办数: c.transfers,
          双审完成率: c.dualReviewRate,
          督办办结率: c.supervisionDoneRate,
          合规通过率: c.compliancePassRate,
          合规失败次数: c.complianceFailCount,
          人数风险会: c.quorumRiskCount,
        })),
        [
          '学院代码',
          '学院名称',
          '会议数',
          '党组织会议议题',
          '联席会议题',
          '转办数',
          '双审完成率',
          '督办办结率',
          '合规通过率',
          '合规失败次数',
          '人数风险会',
        ],
      ),
      { name: '02-学院对比.csv' },
    );

    archive.append(
      toCsv(
        data.meetings.map((m) => ({
          学院: m.college?.name,
          会议名称: m.title,
          类型: m.meetingType,
          状态: m.status,
          应到: m.shouldAttend,
          实到: m.actualAttend,
          可决议: m.canResolve ? '是' : '否',
          重大事项: m.isMajor ? '是' : '否',
          议题数: m.topics?.length || 0,
          纪要生效: m.minutes?.effectiveAt ? '是' : '否',
          创建时间: m.createdAt,
        })),
        [
          '学院',
          '会议名称',
          '类型',
          '状态',
          '应到',
          '实到',
          '可决议',
          '重大事项',
          '议题数',
          '纪要生效',
          '创建时间',
        ],
      ),
      { name: '03-会议台账.csv' },
    );

    archive.append(
      toCsv(
        data.supervisions.map((s) => ({
          学院: s.resolution.topic.college?.name,
          督办事项: s.title,
          责任人: s.owner.realName,
          状态: s.status,
          截止时间: s.dueAt || '',
          关联议题: s.resolution.topic.title,
          反馈数: s.feedbacks?.length || 0,
        })),
        ['学院', '督办事项', '责任人', '状态', '截止时间', '关联议题', '反馈数'],
      ),
      { name: '04-督办台账.csv' },
    );

    archive.append(
      toCsv(
        data.complianceLogs.map((l) => ({
          规则: l.ruleCode,
          通过: l.passed ? '是' : '否',
          说明: l.message,
          学院ID: l.collegeId || '',
          会议ID: l.meetingId || '',
          议题ID: l.topicId || '',
          时间: l.createdAt,
        })),
        ['规则', '通过', '说明', '学院ID', '会议ID', '议题ID', '时间'],
      ),
      { name: '05-合规校验日志.csv' },
    );

    archive.append(
      toCsv(
        data.transfers.map((t) => ({
          学院: t.sourceTopic.college?.name,
          源议题: t.sourceTopic.title,
          源状态: t.sourceTopic.status,
          目标议题: t.targetTopic.title,
          目标状态: t.targetTopic.status,
          已关联决议: t.targetTopic.relatedPartyResolutionId ? '是' : '否',
          转办说明: t.sourceResolutionNote || '',
          时间: t.createdAt,
        })),
        [
          '学院',
          '源议题',
          '源状态',
          '目标议题',
          '目标状态',
          '已关联决议',
          '转办说明',
          '时间',
        ],
      ),
      { name: '06-转办链路.csv' },
    );

    archive.append(JSON.stringify(data.warnings, null, 2), {
      name: '07-预警汇总.json',
    });

    for (const meeting of data.sampleMeetings) {
      const safeName = `${meeting.college?.code || 'COL'}_${meeting.id}`.replace(
        /[^\w\u4e00-\u9fa5\-]+/g,
        '_',
      );
      archive.append(JSON.stringify(meeting, null, 2), {
        name: `08-抽样会议全宗/${safeName}.json`,
      });
    }

    await this.audit.log({
      user,
      action: 'EXPORT_INSPECTION_PACK',
      resource: 'InspectionPack',
      detail: {
        scope: data.scope,
        meetingCount: data.meetings.length,
        sampleCount: data.sampleMeetings.length,
      },
    });

    const filename = `巡视材料包_${data.scope}_${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;

    void archive.finalize();

    return {
      file: new StreamableFile(pass),
      filename: encodeURIComponent(filename),
    };
  }
}
