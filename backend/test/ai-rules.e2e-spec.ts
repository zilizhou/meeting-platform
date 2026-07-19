import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('AI 议事规则问答（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('可列出规则主题，并就缺席计票等问题返回答案与出处', async () => {
    const topics = await request(ctx.app.getHttpServer())
      .get('/api/ai/rules/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(Array.isArray(topics.body)).toBe(true);
    expect(topics.body.length).toBeGreaterThan(5);

    const ask = await request(ctx.app.getHttpServer())
      .post('/api/ai/rules/ask')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ question: '缺席书面意见算不算票？' })
      .expect(201);

    expect(ask.body.kind).toBe('RULES_ASK');
    expect(ask.body.outputText).toBeTruthy();
    expect(ask.body.citations?.length).toBeGreaterThan(0);
    expect(
      ask.body.citations.some(
        (c: any) => c.id === 'absent' || /不计票|缺席/.test(c.excerpt || ''),
      ),
    ).toBe(true);
    expect(String(ask.body.outputText)).toMatch(/不计票|不得计入/);

    const quorum = await request(ctx.app.getHttpServer())
      .post('/api/ai/rules/ask')
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ question: '重大事项法定人数是多少？' })
      .expect(201);
    expect(quorum.body.citations.some((c: any) => c.id === 'quorum')).toBe(
      true,
    );
  });
});
