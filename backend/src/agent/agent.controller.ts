import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.agent.history(user, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Delete('history')
  clearHistory(@CurrentUser() user: AuthUser) {
    return this.agent.clearHistory(user);
  }

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: AgentChatDto) {
    return this.agent.chat(user, dto);
  }

  /** SSE：event=status|meta|token|done|error */
  @Post('chat/stream')
  async chatStream(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentChatDto,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    try {
      await this.agent.chatStream(user, dto, send);
    } catch (e: any) {
      send('error', {
        message: String(e?.message || e || '流式对话失败'),
      });
    } finally {
      res.end();
    }
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
