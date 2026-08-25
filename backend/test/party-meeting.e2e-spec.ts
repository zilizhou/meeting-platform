import request from 'supertest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  checkInUsers,
  createApprovedPartyTopic,
  createTestApp,
  TestCtx,
} from './helpers';

describe('党委会正式开会（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function prepareApprovedPartyTopic(title: string) {
    return createApprovedPartyTopic(ctx, title);
  }

  it('联席会议题不能入党委会会议程', async () => {
    const joint = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '联席会议题误入党委会', meetingType: 'JOINT_CONFERENCE' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '非法党委会',
        meetingType: 'PARTY_COMMITTEE',
        topicIds: [joint.body.id],
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(/类型不匹配|不能入/);
  });

  it('党组织会议无第一议题不能创建会议', async () => {
    const build = await ctx.prisma.categoryDict.findFirst({
      where: { meetingType: 'PARTY_COMMITTEE', code: 'PARTY_BUILD' },
    });
    expect(build).toBeTruthy();
    const topicId = await createApprovedPartyTopic(ctx, '党建专项无第一议题', {
      categoryId: build!.id,
    });
    const res = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '缺第一议题的党委会',
        meetingType: 'PARTY_COMMITTEE',
        topicIds: [topicId],
      })
      .expect(400);
    expect(String(res.body.message)).toMatch(/第一议题/);
  });

  it('党委会开会：签到表决决议，书记单签纪要生效，可转联席会', async () => {
    const topicId = await prepareApprovedPartyTopic('党员发展专题会');

    const meetingRes = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '测试学院党委会议',
        meetingType: 'PARTY_COMMITTEE',
        periodNo: 'P-1',
        topicIds: [topicId],
      })
      .expect(201);

    expect(meetingRes.body.meetingType).toBe('PARTY_COMMITTEE');
    // 党委会名单：书记 + 副书记 = 2
    expect(meetingRes.body.shouldAttend).toBe(2);
    const meetingId = meetingRes.body.id as string;

    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.viceSecretary.id,
    ]);

    const afterCheckin = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(afterCheckin.body.canResolve).toBe(true);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote-all-approve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    const resolved = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        resultType: 'APPROVED',
        content: '通过并转联席会',
        transferToJoint: true,
      })
      .expect(201);

    const topic = resolved.body.topics.find((t: any) => t.id === topicId);
    expect(topic.status).toBe('RESOLVED');
    expect(topic.resolution.resultType).toBe('APPROVED');

    const transfer = await ctx.prisma.transferLink.findUnique({
      where: { sourceTopicId: topicId },
    });
    expect(transfer).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '党委会纪要' })
      .expect(201);

    const saved = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(saved.body.minutes?.content).toContain('党委会纪要');
    expect(saved.body.status).toBe('RESOLVED');
  });

  it('副书记可代主持，不可审题或形成决议', async () => {
    const topicId = await prepareApprovedPartyTopic('副书记权限边界议题');

    // 副书记不可审题（另开待审议题验证）
    const pending = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '副书记不可审题',
        content: '权限测试',
        meetingType: 'PARTY_COMMITTEE',
      })
      .expect(201);
    for (const m of pending.body.materials.filter((x: any) => x.isRequired)) {
      const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-vs.txt`);
      writeFileSync(tmp, 'vs-material');
      await request(ctx.app.getHttpServer())
        .post(`/api/topics/materials/${m.id}/upload`)
        .set('Authorization', `Bearer ${ctx.users.office.token}`)
        .attach('file', tmp)
        .expect(201);
    }
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${pending.body.id}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${pending.body.id}/review`)
      .set('Authorization', `Bearer ${ctx.users.viceSecretary.token}`)
      .send({ decision: 'APPROVED' })
      .expect(403);

    // 副书记不可 partyResolve
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/party-resolve`)
      .set('Authorization', `Bearer ${ctx.users.viceSecretary.token}`)
      .send({ resultType: 'APPROVED', content: '越权' })
      .expect(403);

    const meetingRes = await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '副书记代主持党委会',
        meetingType: 'PARTY_COMMITTEE',
        periodNo: 'P-VS',
        topicIds: [topicId],
      })
      .expect(201);
    const meetingId = meetingRes.body.id as string;

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/start`)
      .set('Authorization', `Bearer ${ctx.users.viceSecretary.token}`)
      .expect(201);

    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.viceSecretary.id,
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
      .post(`/api/meetings/${meetingId}/end`)
      .set('Authorization', `Bearer ${ctx.users.viceSecretary.token}`)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '副书记代签纪要测试' })
      .expect(201);

    const saved = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(saved.body.minutes?.content).toContain('副书记代签纪要测试');
    expect(saved.body.status).toBe('RESOLVED');
  });

  it('会议列表按 meetingType 隔离', async () => {
    const party = await request(ctx.app.getHttpServer())
      .get('/api/meetings')
      .query({ meetingType: 'PARTY_COMMITTEE' })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    const joint = await request(ctx.app.getHttpServer())
      .get('/api/meetings')
      .query({ meetingType: 'JOINT_CONFERENCE' })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    expect(party.body.every((m: any) => m.meetingType === 'PARTY_COMMITTEE')).toBe(true);
    expect(joint.body.every((m: any) => m.meetingType === 'JOINT_CONFERENCE')).toBe(true);
  });
});
