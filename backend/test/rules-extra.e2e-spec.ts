import { writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

async function uploadRequired(ctx: TestCtx, materials: any[]) {
  for (const m of materials.filter((x) => x.isRequired)) {
    const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-x.txt`);
    writeFileSync(tmp, 'x');
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/materials/${m.id}/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', tmp)
      .expect(201);
  }
}

describe('回避 / 最后表态 / 站内消息（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('回避人员不得表决；代录自动跳过', async () => {
    const topicId = await createApprovedTopic(ctx, '回避表决议题');
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/avoid-users`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ userIds: [ctx.users.viceDean.id] })
      .expect(201);

    const meetingId = await createMeetingWithTopic(ctx, topicId);
    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
    ]);

    const blocked = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ method: 'HAND', approve: true })
      .expect(403);
    expect(String(blocked.body.message)).toContain('回避');

    const proxy = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote-all-approve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    expect(proxy.body.skippedAvoid).toBe(1);
    expect(proxy.body.count).toBe(2);
  });

  it('书记最后表态前须其他正式成员先发言', async () => {
    const topicId = await createApprovedTopic(ctx, '最后表态议题');
    // 院长回避，便于只验证「副院长先发言 → 书记最后表态」
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/avoid-users`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ userIds: [ctx.users.dean.id] })
      .expect(201);

    const meetingId = await createMeetingWithTopic(ctx, topicId);
    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
    ]);

    const early = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/discuss`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ opinion: 'AGREE', isFinal: true })
      .expect(400);
    expect(String(early.body.message)).toContain('最后表态');

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/discuss`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ opinion: 'AGREE', reason: '副院长先发言' })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/discuss`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ opinion: 'AGREE', reason: '书记最后表态', isFinal: true })
      .expect(201);

    const after = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/discuss`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ opinion: 'DISAGREE' })
      .expect(400);
    expect(String(after.body.message)).toContain('最后表态');
  });

  it('提交双审后书记收到站内消息', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '消息通知议题', content: 'notify' })
      .expect(201);
    await uploadRequired(ctx, createRes.body.materials);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${createRes.body.id}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    const list = await request(ctx.app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(200);

    expect(
      list.body.some(
        (n: any) =>
          n.type === 'JOINT_REVIEW' && String(n.title).includes('消息通知议题'),
      ),
    ).toBe(true);

    const count = await request(ctx.app.getHttpServer())
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(200);
    expect(count.body.count).toBeGreaterThanOrEqual(1);
  });
});
