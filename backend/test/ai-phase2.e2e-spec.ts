import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('AI 二期：申报辅助 + 审题简报（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('议题征集辅助：根据描述生成标题/内容/分类', async () => {
    const status = await request(ctx.app.getHttpServer())
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(status.body.capabilities).toEqual(
      expect.arrayContaining(['ASSIST_CREATE', 'REVIEW_BRIEF']),
    );

    const byDesc = await request(ctx.app.getHttpServer())
      .post('/api/ai/assist/create')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        description:
          '拟引进两名高层次人才，充实教师队伍，需要配套安家费与编制安排',
        meetingType: 'JOINT_CONFERENCE',
      })
      .expect(201);
    expect(byDesc.body.suggestedTitle).toBeTruthy();
    expect(byDesc.body.suggestedContent).toBeTruthy();
    expect(byDesc.body.suggestedCategoryId || byDesc.body.suggestedCategoryName).toBeTruthy();

    const assist = await request(ctx.app.getHttpServer())
      .post('/api/ai/assist/create')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '关于引进高层次人才与教师队伍建设的议案',
        content: '拟引进学科带头人，涉及重大编制与预算安排',
        meetingType: 'JOINT_CONFERENCE',
      })
      .expect(201);

    expect(assist.body.kind).toBe('ASSIST_CREATE');
    expect(assist.body.demo).toBe(true);
    expect(assist.body.suggestedCategoryId || assist.body.suggestedCategoryName).toBeTruthy();
    expect(Array.isArray(assist.body.materials)).toBe(true);
    expect(assist.body.suggestions).toBeTruthy();
    expect(assist.body.suggestions.isMajor).toBe(true);
    expect(assist.body.suggestions.needPartyPrecheck).toBe(true);
    expect(String(assist.body.narrative || assist.body.outputText)).toBeTruthy();
  });

  it('审题简报：生成齐备性检查与关注点，可再次读取', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '审题简报测试议题',
        meetingType: 'JOINT_CONFERENCE',
        content: '用于验证审题辅读简报',
        isMajor: true,
      })
      .expect(201);
    const topicId = created.body.id;

    const brief = await request(ctx.app.getHttpServer())
      .post(`/api/ai/topics/${topicId}/review-brief`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    expect(brief.body.kind).toBe('REVIEW_BRIEF');
    expect(brief.body.demo).toBe(true);
    expect(brief.body.outputText).toContain('审题简报测试议题');
    expect(brief.body.outputText).toMatch(/齐备性|关注点|声明/);
    expect(Array.isArray(brief.body.checklist)).toBe(true);
    expect(brief.body.checklist.some((c: any) => c.key === 'materials')).toBe(
      true,
    );
    expect(brief.body.focusPoints?.length).toBeGreaterThan(0);

    const latest = await request(ctx.app.getHttpServer())
      .get(`/api/ai/topics/${topicId}/review-brief`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(latest.body.brief?.id).toBe(brief.body.id);
    expect(Array.isArray(latest.body.brief?.checklist)).toBe(true);
  });
});
