import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AiModule } from '../ai/ai.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [AiModule, WorkspaceModule],
  providers: [AgentService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
