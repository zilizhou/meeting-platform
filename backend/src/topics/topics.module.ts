import { Module } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { TopicsController } from './topics.controller';
import { ComplianceModule } from '../compliance/compliance.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [ComplianceModule, FilesModule],
  providers: [TopicsService],
  controllers: [TopicsController],
  exports: [TopicsService],
})
export class TopicsModule {}
