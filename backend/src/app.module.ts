import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrgModule } from './org/org.module';
import { TopicsModule } from './topics/topics.module';
import { MeetingsModule } from './meetings/meetings.module';
import { ComplianceModule } from './compliance/compliance.module';
import { SupervisionsModule } from './supervisions/supervisions.module';
import { AuditModule } from './audit/audit.module';
import { FilesModule } from './files/files.module';
import { AdminModule } from './admin/admin.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { NotificationsModule } from './notifications/notifications.module';

import { ArchivesModule } from './archives/archives.module';
import { SystemModule } from './system/system.module';
import { AiModule } from './ai/ai.module';
import { AgentModule } from './agent/agent.module';
import { PartyImportModule } from './party-import/party-import.module';
import { FeedbackModule } from './feedback/feedback.module';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { clientIpFromReq } from './common/request-context';

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: envInt('THROTTLE_TTL_MS', 60_000),
        limit: envInt('THROTTLE_LIMIT', 120),
        getTracker: (req) =>
          clientIpFromReq(req as any) ||
          req.ip ||
          req.socket?.remoteAddress ||
          'unknown',
      },
    ]),
    PrismaModule,
    AuditModule,
    FilesModule,
    NotificationsModule,
    AuthModule,
    OrgModule,
    TopicsModule,
    MeetingsModule,
    ComplianceModule,
    SupervisionsModule,
    AdminModule,
    WorkspaceModule,
    ArchivesModule,
    SystemModule,
    AiModule,
    AgentModule,
    PartyImportModule,
    FeedbackModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
