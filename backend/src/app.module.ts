import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
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
  ],
})
export class AppModule {}
