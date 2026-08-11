import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  collegeId: string;
  users: {
    office: { id: string; token: string };
    secretary: { id: string; token: string };
    viceSecretary: { id: string; token: string };
    dean: { id: string; token: string };
    viceDean: { id: string; token: string };
    attendee: { id: string; token: string };
  };
}

const TEST_DB = join(__dirname, '..', 'prisma', 'test.db');
const TEST_UPLOAD = join(__dirname, '..', 'uploads-test');

function resetTestDatabase() {
  // Prisma 5's SQLite schema engine does not reliably create a missing database
  // file on newer Node/macOS combinations.  Create the empty file explicitly and
  // remove every SQLite sidecar so a previous interrupted run cannot retain locks.
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
  writeFileSync(TEST_DB, '');
}

export async function createTestApp(): Promise<TestCtx> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  process.env.JWT_SECRET = 'test-secret';
  process.env.UPLOAD_DIR = TEST_UPLOAD;
  process.env.PORT = '0';
  // e2e 固定走本地演示生成，避免依赖外网大模型
  // 须赋空串（不能 delete），否则 ConfigModule 会从 .env 重新注入密钥
  process.env.LLM_API_KEY = '';
  process.env.LLM_BASE_URL = '';
  process.env.LLM_MODEL = '';
  process.env.LLM_PROVIDER = '';

  resetTestDatabase();
  if (existsSync(TEST_UPLOAD)) rmSync(TEST_UPLOAD, { recursive: true });
  mkdirSync(TEST_UPLOAD, { recursive: true });

  // 用现有 migration 初始化测试库
  execSync('pnpm exec prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  const seeded = await seedFixture(prisma);
  const tokens = await loginAll(app, [
    'office',
    'secretary',
    'vice_secretary',
    'dean',
    'vicedean',
    'attendee',
  ]);

  return {
    app,
    prisma,
    collegeId: seeded.collegeId,
    users: {
      office: { id: seeded.ids.office, token: tokens.office },
      secretary: { id: seeded.ids.secretary, token: tokens.secretary },
      viceSecretary: {
        id: seeded.ids.viceSecretary,
        token: tokens.vice_secretary,
      },
      dean: { id: seeded.ids.dean, token: tokens.dean },
      viceDean: { id: seeded.ids.vicedean, token: tokens.vicedean },
      attendee: { id: seeded.ids.attendee, token: tokens.attendee },
    },
  };
}

async function seedFixture(prisma: PrismaService) {
  const roles = await Promise.all(
    [
      ['SCHOOL_ADMIN', '校级管理员'],
      ['SCHOOL_VIEWER', '校级查阅'],
      ['COLLEGE_ADMIN', '学院管理员'],
      ['SECRETARY', '党委书记'],
      ['VICE_SECRETARY', '党委副书记'],
      ['DEAN', '院长'],
      ['VICE_DEAN', '副院长'],
      ['PARTY_MEMBER', '党委委员'],
      ['MEETING_SECRETARY', '会议秘书'],
      ['DEPT_HEAD', '部门负责人'],
      ['ATTENDEE', '列席人员'],
    ].map(([code, name]) => prisma.role.create({ data: { code, name } })),
  );
  const roleMap = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  const college = await prisma.college.create({
    data: { code: 'TEST', name: '测试学院' },
  });
  const passwordHash = await bcrypt.hash('123456', 8);

  async function createUser(
    username: string,
    realName: string,
    title: string,
    roleCodes: string[],
  ) {
    return prisma.user.create({
      data: {
        username,
        passwordHash,
        realName,
        title,
        collegeId: college.id,
        roles: {
          create: roleCodes.map((code) => ({ roleId: roleMap[code] })),
        },
      },
    });
  }

  const office = await createUser('office', '赵秘书', '会议秘书', [
    'MEETING_SECRETARY',
    'COLLEGE_ADMIN',
  ]);
  const secretary = await createUser('secretary', '张书记', '党委书记', [
    'SECRETARY',
  ]);
  const viceSecretary = await createUser(
    'vice_secretary',
    '孔副书记',
    '党委副书记',
    ['VICE_SECRETARY', 'PARTY_MEMBER'],
  );
  const dean = await createUser('dean', '李院长', '院长', ['DEAN']);
  const vicedean = await createUser('vicedean', '王副院长', '副院长', [
    'VICE_DEAN',
  ]);
  const attendee = await createUser('attendee', '列席老师', '系主任', [
    'ATTENDEE',
  ]);

  // 联席会正式成员
  for (const [userId, order, isFormal] of [
    [secretary.id, 1, true],
    [dean.id, 2, true],
    [vicedean.id, 3, true],
    [viceSecretary.id, 4, true],
    [attendee.id, 5, false],
  ] as const) {
    await prisma.rosterMember.create({
      data: {
        collegeId: college.id,
        meetingType: 'JOINT_CONFERENCE',
        userId,
        isFormal,
        sortOrder: order,
      },
    });
  }

  // 党委会正式成员：书记 + 副书记
  for (const [userId, order] of [
    [secretary.id, 1],
    [viceSecretary.id, 2],
  ] as const) {
    await prisma.rosterMember.create({
      data: {
        collegeId: college.id,
        meetingType: 'PARTY_COMMITTEE',
        userId,
        isFormal: true,
        sortOrder: order,
      },
    });
  }

  await prisma.categoryDict.create({
    data: {
      meetingType: 'JOINT_CONFERENCE',
      code: 'PARTY_TRANSFER',
      name: '党委转办落实类',
      sortOrder: 9,
      needPrecheck: true,
    },
  });
  await prisma.categoryDict.create({
    data: {
      meetingType: 'PARTY_COMMITTEE',
      code: 'PARTY_BUILD',
      name: '党建与组织建设',
      sortOrder: 1,
    },
  });

  return {
    collegeId: college.id,
    ids: {
      office: office.id,
      secretary: secretary.id,
      viceSecretary: viceSecretary.id,
      dean: dean.id,
      vicedean: vicedean.id,
      attendee: attendee.id,
    },
  };
}

async function loginAll(app: INestApplication, usernames: string[]) {
  const result: Record<string, string> = {};
  for (const username of usernames) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: '123456' })
      .expect(201);
    result[username] = res.body.accessToken;
  }
  return result;
}

export async function createApprovedTopic(
  ctx: TestCtx,
  title = '测试议题',
  opts?: { isMajor?: boolean; needPartyPrecheck?: boolean },
) {
  const createRes = await request(ctx.app.getHttpServer())
    .post('/api/topics')
    .set('Authorization', `Bearer ${ctx.users.office.token}`)
    .send({
      title,
      content: '自动化测试',
      isMajor: opts?.isMajor ?? false,
      needPartyPrecheck: opts?.needPartyPrecheck ?? false,
      relatedPartyResolutionId: opts?.needPartyPrecheck
        ? 'party-resolution-mock'
        : undefined,
    })
    .expect(201);

  const topicId = createRes.body.id as string;
  const required = (createRes.body.materials || []).filter(
    (m: any) => m.isRequired,
  );
  for (const m of required) {
    const tmp = join(TEST_UPLOAD, `${m.id}.txt`);
    writeFileSync(tmp, `material-${m.id}`);
    await request(ctx.app.getHttpServer())
      .post(`/api/topics/materials/${m.id}/upload`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .attach('file', tmp)
      .expect(201);
  }

  await request(ctx.app.getHttpServer())
    .post(`/api/topics/${topicId}/submit-review`)
    .set('Authorization', `Bearer ${ctx.users.office.token}`)
    .expect(201);

  await request(ctx.app.getHttpServer())
    .post(`/api/topics/${topicId}/review`)
    .set('Authorization', `Bearer ${ctx.users.secretary.token}`)
    .send({ decision: 'APPROVED' })
    .expect(201);

  const dual = await request(ctx.app.getHttpServer())
    .post(`/api/topics/${topicId}/review`)
    .set('Authorization', `Bearer ${ctx.users.dean.token}`)
    .send({ decision: 'APPROVED' })
    .expect(201);

  expect(dual.body.status).toBe('APPROVED');
  return topicId;
}

export async function createMeetingWithTopic(
  ctx: TestCtx,
  topicId: string,
  opts?: { isMajor?: boolean; title?: string },
) {
  const res = await request(ctx.app.getHttpServer())
    .post('/api/meetings')
    .set('Authorization', `Bearer ${ctx.users.office.token}`)
    .send({
      title: opts?.title || '测试联席会',
      periodNo: 'T-1',
      isMajor: opts?.isMajor ?? false,
      topicIds: [topicId],
    })
    .expect(201);
  return res.body.id as string;
}

export async function checkInUsers(
  ctx: TestCtx,
  meetingId: string,
  userIds: string[],
) {
  for (const userId of userIds) {
    await request(ctx.app.getHttpServer())
      .post(`/api/meetings/${meetingId}/checkin`)
      .set('Authorization', `Bearer ${ctx.users.office.token}`)
      .send({ userId })
      .expect(201);
  }
}
