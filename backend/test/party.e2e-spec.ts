import request from 'supertest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createTestApp, TestCtx } from './helpers';

describe('党委会子系统与转联席会（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function createPartyTopicReady(title: string) {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title,
        content: '党建测试',
        meetingType: 'PARTY_COMMITTEE',
        isMajor: true,
      })
      .expect(201);

    const topicId = createRes.body.id as string;
    expect(createRes.body.meetingType).toBe('PARTY_COMMITTEE');

    for (const m of createRes.body.materials.filter((x: any) => x.isRequired)) {
      const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-p.txt`);
      writeFileSync(tmp, 'party-material');
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

    const reviewed = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(reviewed.body.status).toBe('APPROVED');
    // 党委会不应要求院长联审
    expect(reviewed.body.jointReviews.every((r: any) => r.side === 'SECRETARY')).toBe(
      true,
    );
    return topicId;
  }

  it('院长不能审党委会议题', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '院长越权审题', meetingType: 'PARTY_COMMITTEE' })
      .expect(201);
    const topicId = createRes.body.id;
    for (const m of createRes.body.materials.filter((x: any) => x.isRequired)) {
      const tmp = join(process.env.UPLOAD_DIR!, `${m.id}-x.txt`);
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

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(String(res.body.message)).toMatch(/书记|党委/);
  });

  it('党委会决议并转联席会：生成带前置关联的联席会议题', async () => {
    const topicId = await createPartyTopicReady('意识形态研判专题');

    const resolved = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/party-resolve`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({
        resultType: 'APPROVED',
        content: '同意按方案推进，提交联席会落实',
        transferToJoint: true,
      })
      .expect(201);

    expect(resolved.body.status).toBe('RESOLVED');
    expect(resolved.body.resolution.resultType).toBe('APPROVED');
    expect(resolved.body.transferTo).toBeTruthy();

    const targetId = resolved.body.transferTo.targetTopicId as string;
    const target = await request(ctx.app.getHttpServer())
      .get(`/api/topics/${targetId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    expect(target.body.meetingType).toBe('JOINT_CONFERENCE');
    expect(target.body.needPartyPrecheck).toBe(true);
    expect(target.body.relatedPartyResolutionId).toBe(resolved.body.resolution.id);
    expect(target.body.title).toContain('党委转办');
    expect(target.body.transferFrom.sourceTopicId).toBe(topicId);
  });

  it('联席会列表与党委会列表按 meetingType 隔离', async () => {
    await createPartyTopicReady('隔离测试党建议题');

    const party = await request(ctx.app.getHttpServer())
      .get('/api/topics')
      .query({ meetingType: 'PARTY_COMMITTEE' })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    const joint = await request(ctx.app.getHttpServer())
      .get('/api/topics')
      .query({ meetingType: 'JOINT_CONFERENCE' })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    expect(party.body.every((t: any) => t.meetingType === 'PARTY_COMMITTEE')).toBe(true);
    expect(joint.body.every((t: any) => t.meetingType === 'JOINT_CONFERENCE')).toBe(true);
  });

  it('未审题通过不能形成党委会决议', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '未审即决', meetingType: 'PARTY_COMMITTEE' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/topics/${createRes.body.id}/party-resolve`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ resultType: 'APPROVED', content: '违规' })
      .expect(400);
    expect(String(res.body.message)).toMatch(/审题|通过/);
  });
});
