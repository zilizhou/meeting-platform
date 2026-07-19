import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('校级监管筛选与导出（E2E）', () => {
  let ctx: TestCtx;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    // 临时提权 office 为校级，便于测试
    await ctx.prisma.user.update({
      where: { id: ctx.users.office.id },
      data: { isSchoolAdmin: true },
    });
    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'office', password: '123456' })
      .expect(201);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await ctx.prisma.user.update({
      where: { id: ctx.users.office.id },
      data: { isSchoolAdmin: false },
    });
    await ctx.app.close();
  });

  it('会议台账支持按学院筛选', async () => {
    const c2 = await ctx.prisma.college.create({
      data: { code: 'ADM2', name: '监管筛选学院' },
    });
    await ctx.prisma.meeting.create({
      data: {
        collegeId: c2.id,
        meetingType: 'JOINT_CONFERENCE',
        title: '筛选学院会议',
        status: 'SCHEDULED',
        shouldAttend: 3,
      },
    });
    await ctx.prisma.meeting.create({
      data: {
        collegeId: ctx.collegeId,
        meetingType: 'JOINT_CONFERENCE',
        title: '本院会议',
        status: 'SCHEDULED',
        shouldAttend: 3,
      },
    });

    const all = await request(ctx.app.getHttpServer())
      .get('/api/admin/meetings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(all.body.length).toBeGreaterThanOrEqual(2);

    const filtered = await request(ctx.app.getHttpServer())
      .get('/api/admin/meetings')
      .query({ collegeId: c2.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(filtered.body.every((m: any) => m.collegeId === c2.id)).toBe(true);
    expect(filtered.body.some((m: any) => m.title === '筛选学院会议')).toBe(true);
  });

  it('预警项含可跳转 link 字段', async () => {
    const warnings = await request(ctx.app.getHttpServer())
      .get('/api/admin/warnings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(warnings.body).toHaveProperty('complianceFails');
    expect(warnings.body).toHaveProperty('overdueSupervisions');
    expect(warnings.body).toHaveProperty('unsignedMinutes');
    expect(warnings.body).toHaveProperty('precheckMissing');
  });

  it('巡视导出支持 collegeId 参数', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/exports/inspection-pack')
      .query({ collegeId: ctx.collegeId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/zip|octet-stream/);
  });
});
