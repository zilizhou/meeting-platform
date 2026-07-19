import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('AI 纪要初稿（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('可根据会议记录生成纪要初稿（演示或真实模型）', async () => {
    const topicId = await createApprovedTopic(ctx, '纪要AI测试议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '纪要AI测试联席会',
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

    const empty = await request(ctx.app.getHttpServer())
      .get(`/api/ai/meetings/${meetingId}/minutes-draft`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(empty.body.draft).toBeNull();

    const draft = await request(ctx.app.getHttpServer())
      .post(`/api/ai/meetings/${meetingId}/minutes-draft`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    expect(draft.body.kind).toBe('MINUTES_DRAFT');
    expect(draft.body.outputText).toBeTruthy();
    expect(draft.body.meetingId).toBe(meetingId);
    expect(String(draft.body.outputText)).toContain('纪要AI测试联席会');
    if (draft.body.demo) {
      expect(draft.body.outputText).toContain('演示模式纪要初稿');
    }

    const latest = await request(ctx.app.getHttpServer())
      .get(`/api/ai/meetings/${meetingId}/minutes-draft`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(latest.body.draft?.id).toBe(draft.body.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: draft.body.outputText })
      .expect(201);
  });
});
