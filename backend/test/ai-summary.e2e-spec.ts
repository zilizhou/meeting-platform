import { writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { createTestApp, TestCtx } from './helpers';

describe('AI 材料智能摘要（E2E）', () => {
  let ctx: TestCtx;
  let topicId = '';
  let materialId = '';

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('无材料时拒绝生成；上传 txt 后可生成演示摘要', async () => {
    const status = await request(ctx.app.getHttpServer())
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(status.body.configured).toBe(false);
    expect(status.body.provider).toBe('demo');

    const created = await request(ctx.app.getHttpServer())
      .post('/api/topics')
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({
        title: 'AI摘要测试议题',
        meetingType: 'JOINT_CONFERENCE',
        content: '关于实验室设备采购的说明',
      })
      .expect(201);
    topicId = created.body.id;
    materialId = created.body.materials?.[0]?.id;
    expect(materialId).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/ai/topics/${topicId}/material-summary`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(400);

    const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads-test');
    const filePath = join(uploadDir, 'ai-summary-demo.txt');
    writeFileSync(
      filePath,
      '本议题拟采购教学实验设备一批，预算约80万元，需联席会审议通过后执行。',
      'utf8',
    );

    await request(ctx.app.getHttpServer())
      .post(`/api/topics/materials/${materialId}/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', filePath)
      .expect(201);

    const summary = await request(ctx.app.getHttpServer())
      .post(`/api/ai/topics/${topicId}/material-summary`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(201);

    expect(summary.body.kind).toBe('MATERIAL_SUMMARY');
    expect(summary.body.demo).toBe(true);
    expect(summary.body.outputText).toContain('演示模式摘要');
    expect(summary.body.outputText).toContain('AI摘要测试议题');

    const latest = await request(ctx.app.getHttpServer())
      .get(`/api/ai/topics/${topicId}/material-summary`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(latest.body.summary?.id).toBe(summary.body.id);
  });
});
