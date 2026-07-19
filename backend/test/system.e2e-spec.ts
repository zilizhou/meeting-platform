import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('系统管理主数据（E2E）', () => {
  let ctx: TestCtx;
  let adminToken = '';

  beforeAll(async () => {
    ctx = await createTestApp();
    const role = await ctx.prisma.role.findUnique({
      where: { code: 'SCHOOL_ADMIN' },
    });
    if (!role) throw new Error('missing SCHOOL_ADMIN role');
    const bcrypt = await import('bcryptjs');
    const admin = await ctx.prisma.user.create({
      data: {
        username: 'sysadmin',
        passwordHash: await bcrypt.hash('123456', 8),
        realName: '系统管理员',
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

  it('学院用户不能访问系统管理接口', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/system/colleges')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post('/api/system/colleges')
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .send({ name: 'X' })
      .expect(403);
  });

  it('校级可创建/编辑学院；有业务数据时禁止删除', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/api/system/colleges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '数学科学学院' })
      .expect(201);

    expect(created.body.name).toBe('数学科学学院');
    expect(created.body.code).toBeTruthy();

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/system/colleges/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '数学学院' })
      .expect(200);
    expect(updated.body.name).toBe('数学学院');

    // 空学院可删
    await request(ctx.app.getHttpServer())
      .delete(`/api/system/colleges/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // 有用户的学院不可删
    await request(ctx.app.getHttpServer())
      .delete(`/api/system/colleges/${ctx.collegeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('校级可维护分类字典，并可创建校级管理员账号', async () => {
    const cat = await request(ctx.app.getHttpServer())
      .post('/api/system/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        meetingType: 'JOINT_CONFERENCE',
        code: 'custom_sys',
        name: '系统自定义类',
        sortOrder: 99,
      })
      .expect(201);
    expect(cat.body.collegeId).toBeNull();
    expect(cat.body.code).toBe('CUSTOM_SYS');

    const list = await request(ctx.app.getHttpServer())
      .get('/api/system/categories')
      .query({ meetingType: 'JOINT_CONFERENCE', scope: 'school' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.some((c: any) => c.id === cat.body.id)).toBe(true);

    await request(ctx.app.getHttpServer())
      .patch(`/api/system/categories/${cat.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '系统自定义类（改）' })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .delete(`/api/system/categories/${cat.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const username = `admin_${Date.now()}`;
    const schoolUser = await request(ctx.app.getHttpServer())
      .post('/api/system/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username,
        realName: '校级乙',
        isSchoolAdmin: true,
        password: '123456',
      })
      .expect(201);
    expect(schoolUser.body.isSchoolAdmin).toBe(true);
    expect(schoolUser.body.collegeId).toBeNull();

    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: '123456' })
      .expect(201);
    expect(login.body.accessToken).toBeTruthy();
  });
});
