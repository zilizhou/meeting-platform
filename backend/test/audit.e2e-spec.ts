import request from 'supertest';
import { createApprovedTopic, createTestApp, TestCtx } from './helpers';

describe('操作审计查询（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('创建议题后可按资源查询审计，副院长无权访问', async () => {
    const topicId = await createApprovedTopic(ctx, '审计查询议题');

    const denied = await request(ctx.app.getHttpServer())
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .expect(403);
    expect(denied.body.message).toMatch(/权限/);

    const all = await request(ctx.app.getHttpServer())
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(Array.isArray(all.body)).toBe(true);
    expect(all.body.some((x: any) => x.resource === 'Topic' && x.action === 'CREATE')).toBe(
      true,
    );

    const byTopic = await request(ctx.app.getHttpServer())
      .get('/api/audit/logs')
      .query({ resource: 'Topic', resourceId: topicId })
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(200);
    expect(byTopic.body.length).toBeGreaterThan(0);
    expect(byTopic.body.every((x: any) => x.resourceId === topicId)).toBe(true);
    expect(byTopic.body[0].user?.realName).toBeTruthy();
  });

  it('学院隔离：他院审计不可见', async () => {
    const other = await ctx.prisma.college.create({
      data: { code: 'AUD2', name: '审计隔离学院' },
    });
    await ctx.prisma.auditLog.create({
      data: {
        collegeId: other.id,
        userId: ctx.users.office.id,
        action: 'CREATE',
        resource: 'Topic',
        resourceId: 'other-topic',
        detail: '他院记录',
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(200);
    expect(res.body.every((x: any) => x.collegeId === ctx.collegeId)).toBe(true);
    expect(res.body.some((x: any) => x.resourceId === 'other-topic')).toBe(false);
  });
});
