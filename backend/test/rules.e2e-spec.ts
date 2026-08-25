import request from 'supertest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('议事规则硬校验（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('双审不一致必须暂缓：书记同意、院长拒绝 → DEFERRED', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '双审暂缓议题', content: 'test' })
      .expect(201);

    const topicId = createRes.body.id;
    const required = createRes.body.materials.filter((m: any) => m.isRequired);
    for (const m of required) {
      const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-a.txt`);
      writeFileSync(tmp, 'x');
      await request(ctx.app.getHttpServer())
        .post(`/api/topics/materials/${m.id}/upload`)
        .set('Authorization', `Bearer ${ctx.users.office.token}`)
        .attach('file', tmp)
        .expect(201);
    }

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ decision: 'APPROVED' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ decision: 'REJECTED', comment: '需补充材料' })
      .expect(201);

    expect(res.body.status).toBe('DEFERRED');
  });

  it('需党组织会议前置但未关联决议 → 创建失败', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '前置议题',
        needPartyPrecheck: true,
      })
      .expect(400);

    expect(String(res.body.message)).toContain('党组织会议');
  });

  it('无需签到即可登记会后决议', async () => {
    const topicId = await createApprovedTopic(ctx, '会后决议议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '会议研究通过' })
      .expect(201);

    const topic = (res.body.topics || []).find((t: any) => t.id === topicId);
    expect(topic?.resolution?.resultType).toBe('APPROVED');
  });

  it('重大事项也可直接登记会后决议', async () => {
    const topicId = await createApprovedTopic(ctx, '重大事项议题', { isMajor: true });
    const meetingId = await createMeetingWithTopic(ctx, topicId, { isMajor: true });

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '原则同意' })
      .expect(201);

    const topic = (res.body.topics || []).find((t: any) => t.id === topicId);
    expect(topic?.resolution?.resultType).toBe('APPROVED');
  });

  it('列席人员无表决权', async () => {
    const topicId = await createApprovedTopic(ctx, '列席表决议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);
    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
      ctx.users.attendee.id,
    ]);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.attendee.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(403);

    expect(String(res.body.message)).toContain('列席');
  });

  it('会后登记决议不依赖现场计票', async () => {
    const topicId = await createApprovedTopic(ctx, '不计票议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '线下表决通过后登记' })
      .expect(201);

    const topic = (res.body.topics || []).find((t: any) => t.id === topicId);
    expect(topic?.resolution?.resultType).toBe('APPROVED');
  });

  it('纪要单签不能生效，双签后生效并生成督办', async () => {
    const topicId = await createApprovedTopic(ctx, '双签纪要议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);
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
      .send({ content: '测试纪要正文' })
      .expect(201);

    const single = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/sign`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(201);
    expect(single.body.minutes.effectiveAt).toBeFalsy();
    expect(single.body.status).not.toBe('RESOLVED');

    const dual = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/sign`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(201);
    expect(dual.body.minutes.effectiveAt).toBeTruthy();
    expect(dual.body.status).toBe('RESOLVED');

    const tasks = await request(ctx.app.getHttpServer())
      .get('/api/supervisions')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(tasks.body.some((t: any) => t.title.includes('双签纪要议题'))).toBe(true);
  });

  it('未双审通过的议题不能入议程', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '未过审议题' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '非法入会议',
        topicIds: [createRes.body.id],
      })
      .expect(400);

    expect(String(res.body.message)).toMatch(/双审|不能入议程/);
  });
});
