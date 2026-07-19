import { Module } from '@nestjs/common';
import { SupervisionsService } from './supervisions.service';
import { SupervisionsController } from './supervisions.controller';

@Module({
  providers: [SupervisionsService],
  controllers: [SupervisionsController],
  exports: [SupervisionsService],
})
export class SupervisionsModule {}
