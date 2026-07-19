import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('校院两级人员管理（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('学院管理员可创建本院用户并分配角色，副院长不可', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({
        username: 'new_vd',
        realName: '新副院长',
        roleCodes: ['VICE_DEAN'],
      })
      .expect(403);

    const created = await request(ctx.app.getHttpServer())
      .post('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        username: `u_${Date.now()}`,
        realName: '测试委员',
        title: '党委委员',
        roleCodes: ['PARTY_MEMBER'],
        password: '123456',
      })
      .expect(201);

    expect(created.body.collegeId).toBe(ctx.collegeId);
    expect(created.body.roleCodes).toContain('PARTY_MEMBER');
    expect(created.body.enabled).toBe(true);

    const list = await request(ctx.app.getHttpServer())
      .get('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(200);
    expect(list.body.some((u: any) => u.id === created.body.id)).toBe(true);
  });

  it('不能分配校级管理员角色；禁用后无法登录', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        username: 'bad_admin',
        realName: '非法校级',
        roleCodes: ['SCHOOL_ADMIN'],
      })
      .expect(400);

    const created = await request(ctx.app.getHttpServer())
      .post('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        username: `dis_${Date.now()}`,
        realName: '待禁用用户',
        roleCodes: ['ATTENDEE'],
        password: '123456',
      })
      .expect(201);

    // 打印禁用前确认
    const disabled = await request(ctx.app.getHttpServer())
      .post(`/api/org/users/${created.body.id}/disable`)
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(201);
    expect(disabled.body.enabled).toBe(false);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: created.body.username, password: '123456' })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post(`/api/org/users/${created.body.id}/enable`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: created.body.username, password: '123456' })
      .expect(201);
    expect(login.body.accessToken).toBeTruthy();
  });

  it('学院不可改他院用户；可重置本院密码', async () => {
    const otherCollege = await ctx.prisma.college.create({
      data: { code: 'USR2', name: '人员隔离学院' },
    });
    const otherUser = await ctx.prisma.user.create({
      data: {
        username: `other_${Date.now()}`,
        passwordHash: ctx.users.office.id, // placeholder, not used for login
        realName: '他院用户',
        collegeId: otherCollege.id,
        enabled: true,
      },
    });
    // fix password hash properly
    const bcrypt = await import('bcryptjs');
    await ctx.prisma.user.update({
      where: { id: otherUser.id },
      data: { passwordHash: await bcrypt.hash('123456', 8) },
    });

    await request(ctx.app.getHttpServer())
      .patch(`/api/org/users/${otherUser.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ realName: '篡改' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/org/users/${ctx.users.viceDean.id}/reset-password`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ password: '654321' })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'vicedean', password: '654321' })
      .expect(201);
  });

  it('可删除无业务数据用户；有业务数据或删自己则拒绝', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        username: `del_${Date.now()}`,
        realName: '待删除用户',
        roleCodes: ['ATTENDEE'],
        password: '123456',
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .delete(`/api/org/users/${ctx.users.office.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(400);

    await request(ctx.app.getHttpServer())
      .delete(`/api/org/users/${created.body.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    const list = await request(ctx.app.getHttpServer())
      .get('/api/org/users')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(list.body.some((u: any) => u.id === created.body.id)).toBe(false);

    // 造一条议题，使副院长成为提案人后不可删
    await ctx.prisma.topic.create({
      data: {
        collegeId: ctx.collegeId,
        meetingType: 'JOINT_CONFERENCE',
        title: '删除保护议题',
        proposerId: ctx.users.viceDean.id,
        status: 'DRAFT',
      },
    });

    await request(ctx.app.getHttpServer())
      .delete(`/api/org/users/${ctx.users.viceDean.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(400);
  });
});
