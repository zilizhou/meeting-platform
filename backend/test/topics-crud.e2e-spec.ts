import request from 'supertest';
import { createApprovedPartyTopic, createTestApp, TestCtx } from './helpers';

describe('议题库修改/删除权限（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function createDraftByDean(title: string) {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ title, content: '院长自建草稿', meetingType: 'PARTY_COMMITTEE' })
      .expect(201);
    return res.body.id as string;
  }

  it('提案人可以修改自己的草稿议题', async () => {
    const topicId = await createDraftByDean('提案人自编辑议题');
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ title: '提案人自编辑议题（已修改）', content: '补充说明' })
      .expect(200);
    expect(res.body.title).toBe('提案人自编辑议题（已修改）');
    expect(res.body.content).toBe('补充说明');
  });

  it('非提案人且非管理员不能修改他人议题', async () => {
    const topicId = await createDraftByDean('他人议题-禁止越权改');
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ title: '越权修改' })
      .expect(403);
    expect(String(res.body.message)).toMatch(/无权|只能/);
  });

  it('非提案人且非管理员不能删除他人议题', async () => {
    const topicId = await createDraftByDean('他人议题-禁止越权删');
    const res = await request(ctx.app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(403);
    expect(String(res.body.message)).toMatch(/无权|只能/);
  });

  it('学院管理员可以修改与删除他人议题', async () => {
    const topicId = await createDraftByDean('管理员可代改议题');
    await request(ctx.app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '管理员已代改' })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(404);
  });

  it('提案人可以删除自己的草稿议题', async () => {
    const topicId = await createDraftByDean('提案人自删草稿');
    await request(ctx.app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(200);
  });

  it('议题已上会后，非管理员提案人不能再自行修改/删除，管理员仍可以', async () => {
    const topicId = await createDraftByDean('提案人上会锁定测试');
    // 补齐材料并走完整审题流程，模拟院长自提议题被审题通过并排会
    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    for (const m of detail.body.materials.filter((x: any) => x.isRequired)) {
      await request(ctx.app.getHttpServer())
        .post(`/api/topics/materials/${m.id}/upload`)
        .set('Authorization', `Bearer ${ctx.users.dean.token}`)
        .attach('file', Buffer.from('lock-test'), `${m.id}.txt`)
        .expect(201);
    }
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/review`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ decision: 'APPROVED' })
      .expect(201);

    const firstTopicId = await createApprovedPartyTopic(ctx, '锁定测试第一议题');
    await request(ctx.app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '党委会锁定测试',
        meetingType: 'PARTY_COMMITTEE',
        topicIds: [firstTopicId, topicId],
      })
      .expect(201);

    const deanTryEdit = await request(ctx.app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ title: '提案人尝试修改已上会议题' })
      .expect(400);
    expect(String(deanTryEdit.body.message)).toMatch(/上会|管理员/);

    const deanTryDelete = await request(ctx.app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(400);
    expect(String(deanTryDelete.body.message)).toMatch(/上会|管理员/);

    const adminEdit = await request(ctx.app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ content: '管理员在已上会后仍可修改内容' })
      .expect(200);
    expect(adminEdit.body.content).toBe('管理员在已上会后仍可修改内容');

    await request(ctx.app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
  });
});
