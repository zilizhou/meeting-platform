import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('校级监管看板（E2E）', () => {
  let ctx: TestCtx;
  let adminToken = '';

  beforeAll(async () => {
    ctx = await createTestApp();
    // 测试夹具未建 admin，临时提权 office 为校级管理员不合适；直接用 prisma 建一个
    const role = await ctx.prisma.role.findUnique({ where: { code: 'SCHOOL_ADMIN' } });
    if (!role) throw new Error('missing SCHOOL_ADMIN role');
    const bcrypt = await import('bcryptjs');
    const admin = await ctx.prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash('123456', 8),
        realName: '校级管理员',
        title: '组织部',
        isSchoolAdmin: true,
        roles: { create: [{ roleId: role.id }] },
      },
    });
    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: admin.username, password: '123456' })
      .expect(201);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('学院秘书不能访问监管接口', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(403);
  });

  it('校级管理员可获取总览、学院对比、预警', async () => {
    const overview = await request(ctx.app.getHttpServer())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(overview.body.collegeCount).toBeGreaterThanOrEqual(1);

    const colleges = await request(ctx.app.getHttpServer())
      .get('/api/admin/colleges')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(colleges.body)).toBe(true);

    const warnings = await request(ctx.app.getHttpServer())
      .get('/api/admin/warnings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(warnings.body).toHaveProperty('complianceFails');
    expect(warnings.body).toHaveProperty('precheckMissing');
    expect(warnings.body).toHaveProperty('monthMissing');

    const rules = await request(ctx.app.getHttpServer())
      .get('/api/admin/frequency-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(rules.body)).toBe(true);

    const saved = await request(ctx.app.getHttpServer())
      .put('/api/admin/frequency-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rules: [
          {
            meetingType: 'PARTY_COMMITTEE',
            period: 'SEMESTER',
            requiredCount: 1,
          },
          {
            meetingType: 'JOINT_CONFERENCE',
            period: 'SEMESTER',
            requiredCount: 1,
          },
        ],
      })
      .expect(200);
    expect(
      saved.body.some(
        (r: { meetingType: string; period: string }) =>
          r.meetingType === 'PARTY_COMMITTEE' && r.period === 'SEMESTER',
      ),
    ).toBe(true);

    expect(overview.body.month?.period).toBe('SEMESTER');

    await request(ctx.app.getHttpServer())
      .get('/api/admin/meetings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get('/api/admin/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('校级管理员可导出巡视材料包 ZIP', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/exports/inspection-pack')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const data: Buffer[] = [];
        response.on('data', (chunk) => data.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(data)));
      })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/zip|octet-stream/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(100);
    // ZIP 文件头 PK
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('学院秘书不能导出巡视材料包', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/admin/exports/inspection-pack')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(403);
  });
});
