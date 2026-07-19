import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('权限与重大事项表决优化（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('副院长不可审题、不可代签到', async () => {
    const topicId = await createApprovedTopic(ctx, '权限审题议题');
    // 再造一个待审议题
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '待审权限议题' })
      .expect(201);
    const pendingId = createRes.body.id as string;
    for (const m of (createRes.body.materials || []).filter((x: any) => x.isRequired)) {
      const { writeFileSync } = await import('fs');
      const { join } = await import('path');
      const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-p.txt`);
      writeFileSync(tmp, 'x');
      await request(ctx.app.getHttpServer())
        .post(`/api/topics/materials/${m.id}/upload`)
        .set('Authorization', `Bearer ${ctx.users.office.token}`)
        .attach('file', tmp)
        .expect(201);
    }
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${pendingId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${pendingId}/review`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ decision: 'APPROVED' })
      .expect(403);

    const meetingId = await createMeetingWithTopic(ctx, topicId);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/checkin`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ userId: ctx.users.dean.id })
      .expect(403);

    // 本人签到仍可
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/checkin`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({})
      .expect(201);
  });

  it('假上传接口已移除', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '假上传议题' })
      .expect(201);
    const materialId = createRes.body.materials[0].id;
    await request(ctx.app.getHttpServer())
      .patch(`/api/topics/materials/${materialId}/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ filePath: 'fake://x' })
      .expect(404);
  });

  it('重大事项赞成票须超过应到会 2/3', async () => {
    const topicId = await createApprovedTopic(ctx, '重大表决议题', {
      isMajor: true,
    });
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      isMajor: true,
    });
    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
    ]);

    // 仅 2 票赞成：应到 3，2/3 门槛为 2，需 >2 才通过，故 2 票应失败
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(201);

    const fail = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '重大事项' })
      .expect(400);
    expect(String(fail.body.message)).toMatch(/三分之二|2\/3|重大/);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '重大事项通过' })
      .expect(201);
  });

  it('非责任人不可办结他人督办', async () => {
    const topicId = await createApprovedTopic(ctx, '督办权限议题');
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
      .send({
        resultType: 'APPROVED',
        content: '通过',
        ownerId: ctx.users.office.id,
      })
      .expect(201);

    const task = await ctx.prisma.supervisionTask.findFirst({
      where: { ownerId: ctx.users.office.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(task).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/supervisions/${task!.id}/complete`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .expect(403);
  });
});
