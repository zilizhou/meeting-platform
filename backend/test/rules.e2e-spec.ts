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

  it('未达半数到会 → 禁止形成决议', async () => {
    const topicId = await createApprovedTopic(ctx, '法定人数议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);

    // 应到 3，只签 1 人（< 1/2）
    await checkInUsers(ctx, meetingId, [ctx.users.secretary.id]);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(detail.body.canResolve).toBe(false);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(201);

    const resolveRes = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '试图违规通过' })
      .expect(400);

    expect(String(resolveRes.body.message)).toMatch(/到会人数不足|禁止形成决议/);
  });

  it('重大事项未达三分之二 → 禁止形成决议', async () => {
    const topicId = await createApprovedTopic(ctx, '重大事项议题', { isMajor: true });
    const meetingId = await createMeetingWithTopic(ctx, topicId, { isMajor: true });

    // 应到 3，签 2 人 = 2/3 刚好达标；先测只签 1 人
    await checkInUsers(ctx, meetingId, [ctx.users.secretary.id]);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(detail.body.isMajor).toBe(true);
    expect(detail.body.canResolve).toBe(false);

    const resolveRes = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED' })
      .expect(400);

    expect(String(resolveRes.body.message)).toMatch(/2\/3|三分之二|到会人数不足|禁止形成决议/);
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

  it('缺席书面意见不计票：仅 1 张计票赞成不足以过半数通过', async () => {
    const topicId = await createApprovedTopic(ctx, '缺席不计票议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);
    // 签到 2/3，法定人数达标
    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
    ]);

    // 仅书记投赞成（1 票）；应到 3，过半数需 >1.5 即至少 2 票
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(201);

    // 写入缺席书面同意（不计票）
    await ctx.prisma.voteRecord.create({
      data: {
        topicId,
        userId: ctx.users.viceDean.id,
        method: 'ORAL',
        approve: true,
        voteCounted: false,
        isAbsentOpinion: true,
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED' })
      .expect(400);

    expect(String(res.body.message)).toMatch(/半数|赞成/);
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
