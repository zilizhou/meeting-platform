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

  it('公开列出学院，无需登录', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/auth/colleges')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((c: { id: string }) => c.id === ctx.collegeId)).toBe(
      true,
    );
  });

  it('注册成功后颁发令牌，角色为列席人员', async () => {
    const username = `reg_${Date.now()}`;
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        username,
        realName: '注册测试',
        title: '教研室主任',
        collegeId: ctx.collegeId,
        password: 'RegTest_123!',
        confirmPassword: 'RegTest_123!',
      })
      .expect(201);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.username).toBe(username);
    expect(res.body.user.realName).toBe('注册测试');
    expect(res.body.user.collegeId).toBe(ctx.collegeId);
    expect(res.body.user.roles).toEqual(['ATTENDEE']);
    expect(res.body.user.mustChangePassword).toBe(false);

    await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('拒绝重复账号、错误学院、角色注入与密码不一致', async () => {
    const username = `dup_${Date.now()}`;
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
    expect(String(dup.body.message)).toContain('用户名已存在');

    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...payload, username: `x_${Date.now()}`, collegeId: 'no-such' })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...payload,
        username: `y_${Date.now()}`,
        confirmPassword: 'Other_123!',
      })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...payload,
        username: `z_${Date.now()}`,
        roleCodes: ['SCHOOL_ADMIN'],
      })
      .expect(400);
  });
});
