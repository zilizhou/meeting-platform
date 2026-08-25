import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('结束会议（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('结束后仍可登记决议并起草纪要；禁止签到/表决', async () => {
    const topicId = await createApprovedTopic(ctx, '结束会议议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '结束会议测试会',
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/start`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
    ]);

    const ended = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/end`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    expect(ended.body.status).toBe('ENDED');

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/checkin`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ userId: ctx.users.secretary.id })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(400);

    const resolved = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ resultType: 'APPROVED', content: '会后登记通过' })
      .expect(201);
    const topic = (resolved.body.topics || []).find((t: any) => t.id === topicId);
    expect(topic?.resolution?.resultType).toBe('APPROVED');

    const minutes = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '散会后起草纪要' })
      .expect(201);
    expect(minutes.body.content).toContain('散会后起草纪要');

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/start`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(400);
  });
});
