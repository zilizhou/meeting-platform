import request from 'supertest';
import {
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('线下纪要附件（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('可上传、下载并删除线下纪要附件', async () => {
    const topicId = await createApprovedTopic(ctx, '线下纪要附件议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '线下纪要附件测试会',
    });

    const uploaded = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', Buffer.from('offline minutes body'), 'minutes.txt')
      .expect(201);

    expect(uploaded.body.minutes?.originalName).toBe('minutes.txt');
    expect(uploaded.body.minutes?.filePath).toBeTruthy();

    const downloaded = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(downloaded.text).toContain('offline minutes body');

    const deleted = await request(ctx.app.getHttpServer())
      .delete(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(deleted.body.minutes?.originalName).toBeFalsy();
    expect(deleted.body.minutes?.filePath).toBeFalsy();

    await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .delete(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(404);
  });
});
