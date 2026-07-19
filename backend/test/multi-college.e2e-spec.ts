import request from 'supertest';
import {
  createApprovedTopic,
  createMeetingWithTopic,
  checkInUsers,
  createTestApp,
  TestCtx,
} from './helpers';

describe('多学院与督办逾期（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('扫描逾期：到期未办结任务标记为 OVERDUE 并通知责任人', async () => {
    const topicId = await createApprovedTopic(ctx, '逾期督办议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId);
    await checkInUsers(ctx, meetingId, [
      ctx.users.secretary.id,
      ctx.users.dean.id,
      ctx.users.viceDean.id,
    ]);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/vote-all-approve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/topics/${topicId}/resolve`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        resultType: 'APPROVED',
        content: '通过',
        ownerId: ctx.users.viceDean.id,
      })
      .expect(201);

    const task = await ctx.prisma.supervisionTask.findFirst({
      where: { ownerId: ctx.users.viceDean.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(task).toBeTruthy();

    await ctx.prisma.supervisionTask.update({
      where: { id: task!.id },
      data: {
        dueAt: new Date(Date.now() - 24 * 3600 * 1000),
        status: 'PENDING',
      },
    });

    const scan = await request(ctx.app.getHttpServer())
      .post('/api/supervisions/scan-overdue')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    expect(scan.body.marked).toBeGreaterThanOrEqual(1);
    expect(scan.body.overdueCount).toBeGreaterThanOrEqual(1);

    const updated = await ctx.prisma.supervisionTask.findUnique({
      where: { id: task!.id },
    });
    expect(updated?.status).toBe('OVERDUE');

    const notes = await request(ctx.app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .expect(200);
    expect(
      notes.body.some((n: any) => n.type === 'SUPERVISION_OVERDUE'),
    ).toBe(true);
  });

  it('校级监管可看到多学院对比（测试库至少 1 院；种子为 4 院）', async () => {
    // 测试夹具只有 1 个学院；额外插入第二学院验证对比接口
    const c2 = await ctx.prisma.college.create({
      data: { code: 'LIT2', name: '测试文学院' },
    });
    await ctx.prisma.topic.create({
      data: {
        collegeId: c2.id,
        meetingType: 'JOINT_CONFERENCE',
        title: '文学院对比议题',
        proposerId: ctx.users.office.id,
        status: 'DRAFT',
      },
    });

    // 借用 office 无校级权限；需 admin。测试夹具未建 admin，临时提权
    await ctx.prisma.user.update({
      where: { id: ctx.users.office.id },
      data: { isSchoolAdmin: true },
    });
    // 重新登录拿带 isSchoolAdmin 的 token
    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'office', password: '123456' })
      .expect(201);
    const token = login.body.accessToken as string;

    const colleges = await request(ctx.app.getHttpServer())
      .get('/api/admin/colleges')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(colleges.body.length).toBeGreaterThanOrEqual(2);
    expect(colleges.body.some((c: any) => c.code === 'LIT2')).toBe(true);

    const overview = await request(ctx.app.getHttpServer())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overview.body.collegeCount).toBeGreaterThanOrEqual(2);

    // 恢复，避免影响同进程其他用例（本文件已是最后）
    await ctx.prisma.user.update({
      where: { id: ctx.users.office.id },
      data: { isSchoolAdmin: false },
    });
  });
});
