import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('请假 / 阅件回执 / 归档（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('请假不影响应到基数，且禁止再签到/表决', async () => {
    const topicId = await createApprovedTopic(ctx, '请假报备议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '请假测试会',
    });

    const before = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    const shouldAttend = before.body.shouldAttend as number;
    expect(shouldAttend).toBeGreaterThanOrEqual(3);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/leave`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ reason: '因公出差，会前向主持人报备' })
      .expect(201);

    const afterLeave = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(afterLeave.body.shouldAttend).toBe(shouldAttend);
    const leaveRow = afterLeave.body.attendances.find(
      (a: any) => a.userId === ctx.users.viceDean.id,
    );
    expect(leaveRow.leaveNote).toContain('因公出差');

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/checkin`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({})
      .expect(400);

    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
    ]);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(400);
  });

  it('材料阅件回执可提交，工作台出现待阅件', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '阅件回执议题', content: 'test' })
      .expect(201);
    const topicId = createRes.body.id as string;
    const material = (createRes.body.materials || []).find((m: any) => m.isRequired);
    expect(material).toBeTruthy();

    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const tmp = join(process.env.UPLOAD_DIR!, `${material.id}-read.txt`);
    writeFileSync(tmp, 'read-me');
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/materials/${material.id}/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', tmp)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    const todos = await request(ctx.app.getHttpServer())
      .get('/api/workspace/todos')
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(200);
    expect(todos.body.summary.materialRead).toBeGreaterThanOrEqual(1);
    expect(
      todos.body.items.some(
        (i: any) => i.type === 'MATERIAL_READ' && i.topicId === topicId,
      ),
    ).toBe(true);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/materials/${material.id}/read`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ note: '已阅' })
      .expect(201);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(200);
    const m = detail.body.materials.find((x: any) => x.id === material.id);
    expect(m.myReadAt).toBeTruthy();
    expect(m.receiptCount).toBeGreaterThanOrEqual(1);
  });

  it('保存纪要后可归档，未保存不可归档', async () => {
    const topicId = await createApprovedTopic(ctx, '归档议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '归档测试会',
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/archive`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(400);

    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
    ]);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote-all-approve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '通过' })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '归档测试纪要' })
      .expect(201);

    const archived = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/archive`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    expect(archived.body.status).toBe('ARCHIVED');

    const filtered = await request(ctx.app.getHttpServer())
      .get('/api/meetings')
      .query({ meetingType: 'JOINT_CONFERENCE', status: 'ARCHIVED' })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(filtered.body.some((m: any) => m.id === meetingId)).toBe(true);
  });
});
