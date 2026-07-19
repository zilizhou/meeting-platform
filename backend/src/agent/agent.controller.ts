import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AgentChatDto, AgentConfirmDto } from './dto/agent.dto';

@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.agent.status(user);
  }

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: AgentChatDto) {
    return this.agent.chat(user, dto);
  }

  @Post('confirm/:actionId')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('actionId') actionId: string,
    @Body() dto: AgentConfirmDto,
  ) {
    return this.agent.confirm(user, actionId, dto);
  }
}
