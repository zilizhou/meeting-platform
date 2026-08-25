import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('自助注册（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('公开列出学院与可注册角色，无需登录', async () => {
    const colleges = await request(ctx.app.getHttpServer())
      .get('/api/auth/colleges')
      .expect(200);
    expect(Array.isArray(colleges.body)).toBe(true);
    expect(
      colleges.body.some((c: { id: string }) => c.id === ctx.collegeId),
    ).toBe(true);

    const roles = await request(ctx.app.getHttpServer())
      .get('/api/auth/roles')
      .expect(200);
    const codes = roles.body.map((r: { code: string }) => r.code);
    expect(codes).toContain('ATTENDEE');
    expect(codes).toContain('DEAN');
    expect(codes).not.toContain('SCHOOL_ADMIN');
  });

  it('可用学工号注册，并按所选角色入职', async () => {
    const username = `2021${Date.now().toString().slice(-6)}`;
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        username,
        realName: '注册测试',
        roleCode: 'DEPT_HEAD',
        collegeId: ctx.collegeId,
        password: 'RegTest_123!',
        confirmPassword: 'RegTest_123!',
      })
      .expect(201);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.username).toBe(username);
    expect(res.body.user.realName).toBe('注册测试');
    expect(res.body.user.collegeId).toBe(ctx.collegeId);
    expect(res.body.user.roles).toEqual(['DEPT_HEAD']);
    expect(res.body.user.mustChangePassword).toBe(false);

    await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('拒绝重复工号、错误学院、校级角色注入与密码不一致', async () => {
    const username = `2022${Date.now().toString().slice(-6)}`;
    const payload = {
      username,
      realName: '重复测试',
      collegeId: ctx.collegeId,
      password: 'RegTest_123!',
      confirmPassword: 'RegTest_123!',
    };
    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    const dup = await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send(payload)
      .expect(400);
    expect(String(dup.body.message)).toContain('该工号已注册');

    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...payload, username: `2023${Date.now().toString().slice(-6)}`, collegeId: 'no-such' })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...payload,
        username: `2024${Date.now().toString().slice(-6)}`,
        confirmPassword: 'Other_123!',
      })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...payload,
        username: `2025${Date.now().toString().slice(-6)}`,
        roleCode: 'SCHOOL_ADMIN',
      })
      .expect(400);
  });
});
