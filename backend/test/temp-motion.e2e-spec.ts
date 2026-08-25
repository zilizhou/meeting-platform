import { writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import {
  createApprovedTopic,
  createTestApp,
  TestCtx,
} from './helpers';

async function uploadRequired(ctx: TestCtx, materials: any[]) {
  for (const m of materials.filter((x) => x.isRequired)) {
    const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-mat.txt`);
    writeFileSync(tmp, 'material');
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/materials/${m.id}/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', tmp)
      .expect(201);
  }
}

describe('临时动议与分类材料（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

    it('按分类生成差异化材料清单：师资类含人事方案', async () => {
    const faculty = await ctx.prisma.categoryDict.create({
      data: {
        meetingType: 'JOINT_CONFERENCE',
        code: 'FACULTY',
        name: '教师队伍建设类',
        sortOrder: 2,
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '师资引进方案',
        categoryId: faculty.id,
        meetingType: 'JOINT_CONFERENCE',
      })
      .expect(201);

    const keys = (res.body.materials || []).map((m: any) => m.requiredKey);
    expect(keys).toContain('survey');
    expect(keys).toContain('personnel');
    expect(
      res.body.materials.find((m: any) => m.requiredKey === 'personnel')
        ?.isRequired,
    ).toBe(false);
  });

  it('临时动议创建时自动增加动议说明（选填）', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '紧急临时动议',
        isTempMotion: true,
        meetingType: 'JOINT_CONFERENCE',
      })
      .expect(201);

    expect(res.body.isTempMotion).toBe(true);
    const note = res.body.materials.find(
      (m: any) => m.requiredKey === 'temp_motion_note',
    );
    expect(note).toBeTruthy();
    expect(note.isRequired).toBe(false);
  });

  it('未上传会前材料也可提交审题', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '无材料直接提交',
        meetingType: 'JOINT_CONFERENCE',
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${res.body.id}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
  });

  it('临时动议未双签通过 → 禁止入会议程', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '未审临时动议',
        isTempMotion: true,
      })
      .expect(201);

    const topicId = createRes.body.id as string;
    await uploadRequired(ctx, createRes.body.materials);

    // 未提交双审，直接尝试入会
    const fail = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '含临时动议的会',
        topicIds: [topicId],
      })
      .expect(400);
    expect(String(fail.body.message)).toMatch(/临时|双审|审题|同意/);
  });

  it('临时动议经书记院长双签后可入会', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '已批临时动议',
        isTempMotion: true,
      })
      .expect(201);

    const topicId = createRes.body.id as string;
    await uploadRequired(ctx, createRes.body.materials);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ decision: 'APPROVED' })
      .expect(201);

    const dual = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(dual.body.status).toBe('APPROVED');

    const meeting = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '临时动议正式会',
        topicIds: [topicId],
      })
      .expect(201);

    expect(meeting.body.topics.some((t: any) => t.id === topicId)).toBe(true);

    const logs = await ctx.prisma.complianceLog.findMany({
      where: { topicId, ruleCode: 'RULE_TEMP_MOTION' },
      orderBy: { createdAt: 'desc' },
    });
    expect(logs[0]?.passed).toBe(true);
  });

  it('普通议题仍可按原流程双审入会（回归）', async () => {
    const topicId = await createApprovedTopic(ctx, '普通回归议题');
    const meeting = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '回归会', topicIds: [topicId] })
      .expect(201);
    expect(meeting.body.id).toBeTruthy();
  });
});
