import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { InspectionExportService } from './inspection-export.service';
import { SupervisionsModule } from '../supervisions/supervisions.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SupervisionsModule, AiModule, NotificationsModule],
  providers: [AdminService, InspectionExportService],
  controllers: [AdminController],
  exports: [AdminService, InspectionExportService],
})
export class AdminModule {}
