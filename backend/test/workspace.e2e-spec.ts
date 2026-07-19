import { writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('Workspace todos & roster (e2e)', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('书记工作台应看到待双审联席会议题', async () => {
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ title: '待办联席议题', content: 'workspace' })
      .expect(201);

    const topicId = createRes.body.id as string;
    for (const m of (createRes.body.materials || []).filter((x: any) => x.isRequired)) {
      const path = join(__dirname, '..', 'uploads-test', `${m.id}.txt`);
      writeFileSync(path, 'x');
      await request(ctx.app.getHttpServer())
        .post(`/api/topics/materials/${m.id}/upload`)
        .set('Authorization', `Bearer ${ctx.users.office.token}`)
        .attach('file', path)
        .expect(201);
    }

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/${topicId}/submit-review`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    const todos = await request(ctx.app.getHttpServer())
      .get('/api/workspace/todos')
      .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
      .expect(200);

    expect(todos.body.summary.jointReview).toBeGreaterThanOrEqual(1);
    expect(
      todos.body.items.some(
        (i: any) => i.type === 'JOINT_REVIEW' && i.topicId === topicId,
      ),
    ).toBe(true);

    const deanTodos = await request(ctx.app.getHttpServer())
      .get('/api/workspace/todos')
      .set('Authorization', `Bearer ${ctx.users.dean.token}`)
      .expect(200);
    expect(
      deanTodos.body.items.some(
        (i: any) => i.type === 'JOINT_REVIEW' && i.topicId === topicId,
      ),
    ).toBe(true);

    const flow = await request(ctx.app.getHttpServer())
      .get('/api/workspace/flow-board')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(flow.body.joint.steps.length).toBeGreaterThanOrEqual(6);
    expect(flow.body.party.steps.length).toBeGreaterThanOrEqual(6);
    expect(
      flow.body.joint.items.some(
        (i: any) => i.topicId === topicId && i.stageKey === 'REVIEW',
      ),
    ).toBe(true);
  });

  it('会议秘书可维护名单；副院长无权限新增', async () => {
    const listBefore = await request(ctx.app.getHttpServer())
      .get('/api/org/roster')
      .query({
        collegeId: ctx.collegeId,
        meetingType: 'JOINT_CONFERENCE',
      })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    const count = listBefore.body.length;

    const attendeeRow = listBefore.body.find(
      (r: any) => r.userId === ctx.users.attendee.id,
    );
    expect(attendeeRow).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .delete(`/api/org/roster/${attendeeRow.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post('/api/org/roster')
      .set('Authorization', `Bearer ${ctx.users.viceDean.token}`)
      .send({
        collegeId: ctx.collegeId,
        meetingType: 'JOINT_CONFERENCE',
        userId: ctx.users.attendee.id,
        isFormal: false,
      })
      .expect(403);

    const added = await request(ctx.app.getHttpServer())
      .post('/api/org/roster')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        collegeId: ctx.collegeId,
        meetingType: 'JOINT_CONFERENCE',
        userId: ctx.users.attendee.id,
        isFormal: false,
        sortOrder: 99,
      })
      .expect(201);

    expect(added.body.userId).toBe(ctx.users.attendee.id);
    expect(added.body.isFormal).toBe(false);

    await request(ctx.app.getHttpServer())
      .patch(`/api/org/roster/${added.body.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ isFormal: true })
      .expect(200);

    const listAfter = await request(ctx.app.getHttpServer())
      .get('/api/org/roster')
      .query({
        collegeId: ctx.collegeId,
        meetingType: 'JOINT_CONFERENCE',
      })
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);

    expect(listAfter.body.length).toBe(count);
    const row = listAfter.body.find(
      (r: any) => r.userId === ctx.users.attendee.id,
    );
    expect(row.isFormal).toBe(true);

    await request(ctx.app.getHttpServer())
      .patch(`/api/org/roster/${row.id}`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ isFormal: false })
      .expect(200);
  });
});
