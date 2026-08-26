import request from 'supertest';
import {
  createApprovedTopic,
  createMeetingWithTopic,
  createTestApp,
  TestCtx,
} from './helpers';
import { decodeUploadFilename, decodeMojibakeText, repairStoredFilenameFields } from '../src/files/files.service';

describe('线下纪要附件（E2E）', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('还原 multer latin1 误解码的中文文件名', () => {
    const raw = Buffer.from('山东学院.docx', 'utf8').toString('latin1');
    expect(raw).not.toBe('山东学院.docx');
    expect(decodeUploadFilename(raw)).toBe('山东学院.docx');
    expect(decodeUploadFilename('山东学院.docx')).toBe('山东学院.docx');
    expect(decodeUploadFilename('minutes.txt')).toBe('minutes.txt');
    const mixed = '线下纪要附件：' + Buffer.from('20210319外国语学院.docx', 'utf8').toString('latin1');
    expect(decodeMojibakeText(mixed)).toBe('线下纪要附件：20210319外国语学院.docx');
    const repaired = repairStoredFilenameFields({
      originalName: '050201英语（语言大数据）.pdf',
      content: mixed,
    });
    expect(repaired.originalName).toBe('050201英语（语言大数据）.pdf');
    expect(repaired.content).toBe('线下纪要附件：050201英语（语言大数据）.pdf');
  });

  it('可上传、下载并删除线下纪要附件', async () => {
    const topicId = await createApprovedTopic(ctx, '线下纪要附件议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '线下纪要附件测试会',
    });

    const uploaded = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', Buffer.from('offline minutes body'), 'minutes.txt')
      .expect(201);

    expect(uploaded.body.minutes?.originalName).toBe('minutes.txt');
    expect(uploaded.body.minutes?.filePath).toBeTruthy();

    const downloaded = await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(downloaded.text).toContain('offline minutes body');

    const deleted = await request(ctx.app.getHttpServer())
      .delete(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(200);
    expect(deleted.body.minutes?.originalName).toBeFalsy();
    expect(deleted.body.minutes?.filePath).toBeFalsy();

    await request(ctx.app.getHttpServer())
      .get(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .delete(`/api/meetings/${meetingId}/minutes/file`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .expect(404);
  });

  it('上传中文文件名时保存为可读名称', async () => {
    const topicId = await createApprovedTopic(ctx, '中文纪要文件名议题');
    const meetingId = await createMeetingWithTopic(ctx, topicId, {
      title: '中文纪要文件名测试会',
    });

    const uploaded = await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/minutes/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', Buffer.from('chinese minutes'), '山东学院.docx')
      .expect(201);

    expect(uploaded.body.minutes?.originalName).toBe('山东学院.docx');
    expect(String(uploaded.body.minutes?.content || '')).toContain('山东学院.docx');
    expect(String(uploaded.body.minutes?.content || '')).not.toMatch(/å±±/);
  });
});
