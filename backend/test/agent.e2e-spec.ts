import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('会议智能助理 Agent（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('status 返回能力分级与免责声明', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/agent/status')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(res.body.role).toBe('meeting_assistant');
    expect(res.body.capabilities).toEqual(
      expect.arrayContaining([
        'REPORT_TODOS',
        'RULES_ASK',
        'DAILY_BRIEF',
        'TOPIC_BRIEF',
        'RISK_EXPLAIN',
        'CONFIRM_FRAMEWORK',
      ]),
    );
    expect(res.body.levels.L4).toMatch(/禁止/);
    expect(res.body.disclaimer).toMatch(/不替代/);
  });

  it('chat：汇报待办；规则问答；高风险表决仅确认卡不执行', async () => {
    const todos = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ message: '我有哪些待办？' })
      .expect(201);
    expect(todos.body.intent).toBe('REPORT_TODOS');
    expect(todos.body.sessionId).toBeTruthy();
    expect(String(todos.body.reply)).toMatch(/待办|概况/);
    expect(todos.body.disclaimer).toBeTruthy();

    const rules = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        message: '缺席书面意见算不算票？',
        sessionId: todos.body.sessionId,
      })
      .expect(201);
    expect(rules.body.intent).toBe('RULES_ASK');
    expect(String(rules.body.reply)).toMatch(/不计票|不得计入|不算/);

    const vote = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ message: '帮我对该议题投赞成票' })
      .expect(201);
    expect(vote.body.intent).toBe('HELP_ACTION');
    expect(Array.isArray(vote.body.actions)).toBe(true);
    const confirmCard = vote.body.actions.find(
      (a: any) => a.type === 'CONFIRM_VOTE',
    );
    expect(confirmCard).toBeTruthy();
    expect(confirmCard.requiresConfirm).toBe(true);
    expect(confirmCard.executable).toBe(false);

    const blocked = await request(ctx.app.getHttpServer())
      .post(`/api/agent/confirm/${confirmCard.id}`)
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({ approved: true })
      .expect(201);
    expect(blocked.body.status).toBe('BLOCKED');
    expect(String(blocked.body.message)).toMatch(/本人|页面/);
  });

  it('chat：今日简报、议题简报、督办预警、审题草稿', async () => {
    const daily = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ message: '今日简报' })
      .expect(201);
    expect(daily.body.intent).toBe('DAILY_BRIEF');
    expect(String(daily.body.reply)).toMatch(/简报|待办|未读/);

    const created = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: '智能助理议题简报测试',
        meetingType: 'JOINT_CONFERENCE',
        content: '用于助理简报',
      })
      .expect(201);
    const topicId = created.body.id as string;

    const topicBrief = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        message: '这个议题怎么样？',
        context: { topicId, route: `/topics/${topicId}` },
      })
      .expect(201);
    expect(['TOPIC_BRIEF', 'CONTEXT_HELP']).toContain(topicBrief.body.intent);
    expect(String(topicBrief.body.reply)).toMatch(/议题|材料|审题/);

    const risk = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        message: '缺什么材料？为什么不能上会？',
        context: { topicId },
      })
      .expect(201);
    expect(risk.body.intent).toBe('RISK_EXPLAIN');

    const alert = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ message: '督办预警' })
      .expect(201);
    expect(alert.body.intent).toBe('SUPERVISION_ALERT');
    expect(String(alert.body.reply)).toMatch(/督办/);

    const stats = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ message: '本月一共有多少党组织会议？' })
      .expect(201);
    expect(stats.body.intent).toBe('STATS_ASK');
    expect(String(stats.body.reply)).toMatch(/结论|场|党组织|共/);

    const quarterStats = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ message: '第一季度，哪些学院开了党政联席会？' })
      .expect(201);
    expect(quarterStats.body.intent).toBe('STATS_ASK');
    expect(String(quarterStats.body.reply)).toMatch(/第一季度|统计|党政联席/);

    const search = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ message: '有哪些议题和人才引进有关？' })
      .expect(201);
    expect(search.body.intent).toBe('SEARCH_TOPIC');
    expect(Array.isArray(search.body.actions)).toBe(true);
    // 检索类只挂匹配议题入口，不塞无关审题待办
    expect(
      search.body.actions.every(
        (a: any) =>
          a.type === 'NAVIGATE' &&
          !String(a.title || '').includes('密码学') &&
          !String(a.title || '').includes('发展党员'),
      ),
    ).toBe(true);

    const history = await request(ctx.app.getHttpServer())
      .get('/api/agent/history')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(Array.isArray(history.body.messages)).toBe(true);
    expect(history.body.messages.length).toBeGreaterThanOrEqual(2);
    expect(history.body.messages.some((m: any) => m.role === 'user')).toBe(true);
    expect(history.body.messages.some((m: any) => m.role === 'assistant')).toBe(
      true,
    );

    const cleared = await request(ctx.app.getHttpServer())
      .delete('/api/agent/history')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(cleared.body.ok).toBe(true);

    const empty = await request(ctx.app.getHttpServer())
      .get('/api/agent/history')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(empty.body.messages).toEqual([]);

    const draft = await request(ctx.app.getHttpServer())
      .post('/api/agent/chat')
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .send({
        message: '帮我写审题意见草稿',
        context: { topicId },
      })
      .expect(201);
    expect(draft.body.intent).toBe('DRAFT_REVIEW_COMMENT');
    expect(String(draft.body.reply)).toMatch(/草稿|参考|审题/);
  });
});
