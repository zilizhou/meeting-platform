import request from 'supertest';
import {
  checkInUsers,
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('档案检索 / 缺席意见 / 重大调整回流（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('缺席书面意见不计票，已签到不可登记', async () => {
    const topicId = await createApprovedTopic(ctx, '缺席意见议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '缺席意见会',
    });

    // 副院长未签到，可提交缺席意见
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/absent-opinion`)
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({ approve: true, reason: '因公出差书面同意' })
      .expect(201);

    const votes = await ctx.prisma.voteRecord.findMany({ where: { topicId } });
    const absent = votes.find((v) => v.userId === ctx.users.viceDean.id);
    expect(absent?.isAbsentOpinion).toBe(true);
    expect(absent?.voteCounted).toBe(false);

    // 书记签到后不可再登记缺席意见
    await checkInUsers(ctx, meetingId, [ctx.users.secretary.id]);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/absent-opinion`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ approve: true })
      .expect(400);
  });

  it('督办重大调整回流新议题，禁止直接改决议', async () => {
    const topicId = await createApprovedTopic(ctx, '调整回流议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '调整回流会',
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
    const task = list.body.find((t: any) => t.title.includes('调整回流议题'));
    expect(task).toBeTruthy();

    const adjusted = await request(ctx.app.getHttpServer())
      .post(`/api/supervisions/${task.id}/request-adjust`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '执行中需重大调整，重新上会' })
      .expect(201);
    expect(adjusted.body.newTopicId).toBeTruthy();
    expect(adjusted.body.task.status).toBe('ADJUST_REQUEST');

    const newTopic = await request(ctx.app.getHttpServer())
      .get(`/api/topics/${adjusted.body.newTopicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(newTopic.body.title).toContain('重大调整回流');
    expect(newTopic.body.status).toBe('DRAFT');
    expect(newTopic.body.isMajor).toBe(true);

    // 原决议仍在，未被直接改写
    const old = await request(ctx.app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(old.body.resolution.resultType).toBe('APPROVED');
  });

  it('档案检索可按重大事项筛选，并可查看会议全宗', async () => {
    const topicId = await createApprovedTopic(ctx, '档案重大议题', {
      isMajor: true,
    });
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '档案重大会议',
      isMajor: true,
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
      .send({ resultType: 'APPROVED', content: '通过' })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '档案测试纪要' })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/sign`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/sign`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/archive`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    const archives = await request(ctx.app.getHttpServer())
      .get('/api/archives')
      .query({ q: '档案重大', isMajor: 'true' })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(archives.body.some((m: any) => m.id === meetingId)).toBe(true);

    const dossier = await request(ctx.app.getHttpServer())
      .get(`/api/archives/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(dossier.body.topics?.length).toBeGreaterThan(0);
    expect(dossier.body.minutes?.effectiveAt).toBeTruthy();
    expect(dossier.body.attendances?.length).toBeGreaterThan(0);
  });
});
