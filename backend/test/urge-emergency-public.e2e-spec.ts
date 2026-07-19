import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('催办 / 紧急临机 / 决议公开（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('督办催办推送消息并累计次数，副院长不可催办', async () => {
    const topicId = await createApprovedTopic(ctx, '催办议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, { title: '催办会' });
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
        ownerId: ctx.users.viceDean.id,
      })
      .expect(201);

    const list = await request(ctx.app.getHttpServer())
      .get('/api/supervisions')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    const task = list.body.find((t: any) => t.title.includes('催办议题'));
    expect(task).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/supervisions/${task.id}/urge`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .expect(403);

    const urged = await request(ctx.app.getHttpServer())
      .post(`/api/supervisions/${task.id}/urge`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    expect(urged.body.urgeCount).toBe(1);

    const msgs = await request(ctx.app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .expect(200);
    expect(
      msgs.body.some(
        (n: any) => n.type === 'SUPERVISION_URGE' && String(n.title).includes('催办'),
      ),
    ).toBe(true);
  });

  it('紧急临机须上传说明，决议后书记院长双签补确认', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '紧急临机议题',
        content: '临机处置',
        isEmergency: true,
      })
      .expect(201);
    const topicId = createRes.body.id as string;
    expect(createRes.body.isEmergency).toBe(true);
    const note = (createRes.body.materials || []).find(
      (m: any) => m.requiredKey === 'emergency_note',
    );
    expect(note).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(400);

    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    for (const m of (createRes.body.materials || []).filter((x: any) => x.isRequired)) {
      const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-em.txt`);
      writeFileSync(tmp, 'emergency');
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
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ decision: 'APPROVED' })
      .expect(201);

    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '紧急临机会',
    });
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
      .send({ resultType: 'APPROVED', content: '临机通过', isPublic: false })
      .expect(201);

    const c1 = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/confirm-emergency`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ note: '书记补确认' })
      .expect(201);
    expect(c1.body.confirmed).toBe(false);

    const c2 = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/confirm-emergency`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ note: '院长补确认' })
      .expect(201);
    expect(c2.body.confirmed).toBe(true);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(detail.body.emergencyConfirmed).toBe(true);
  });

  it('决议可标记公开，涉密不可公开', async () => {
    const topicId = await createApprovedTopic(ctx, '公开决议议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '公开决议会',
    });
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
      .send({ resultType: 'APPROVED', content: '通过', isPublic: true })
      .expect(201);

    const pub = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/publish-resolution`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ isPublic: true, securityLevel: 'PUBLIC' })
      .expect(201);
    expect(pub.body.isPublic).toBe(true);

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/publish-resolution`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ isPublic: true, securityLevel: 'SECRET' })
      .expect(400);
  });
});
