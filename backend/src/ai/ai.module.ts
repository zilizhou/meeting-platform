import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { LlmProvider } from './llm.provider';
import { RulesRagService } from './rules-rag.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  providers: [AiService, LlmProvider, RulesRagService],
  controllers: [AiController],
  exports: [AiService, LlmProvider],
})
export class AiModule {}
