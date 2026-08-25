import { Module } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { ComplianceModule } from '../compliance/compliance.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [ComplianceModule, FilesModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
  exports: [MeetingsService],
})
export class MeetingsModule {}
