import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AskRulesDto } from './dto/ask-rules.dto';
import { AssistCreateDto } from './dto/assist-create.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  @Get('rules/topics')
  ruleTopics() {
    return this.ai.listRuleTopics();
  }

  @Post('rules/ask')
  askRules(@CurrentUser() user: AuthUser, @Body() dto: AskRulesDto) {
    return this.ai.askRules(user, dto.question, dto.collegeId);
  }

  @Post('assist/create')
  assistCreate(@CurrentUser() user: AuthUser, @Body() dto: AssistCreateDto) {
    return this.ai.assistCreate(user, dto);
  }

  @Get('topics/:topicId/review-brief')
  latestBrief(
    @CurrentUser() user: AuthUser,
    @Param('topicId') topicId: string,
  ) {
    return this.ai.getLatestReviewBrief(user, topicId);
  }

  @Post('topics/:topicId/review-brief')
  reviewBrief(
    @CurrentUser() user: AuthUser,
    @Param('topicId') topicId: string,
  ) {
    return this.ai.reviewBrief(user, topicId);
  }

  @Get('topics/:topicId/material-summary')
  latest(
    @CurrentUser() user: AuthUser,
    @Param('topicId') topicId: string,
  ) {
    return this.ai.getLatestMaterialSummary(user, topicId);
  }

  @Post('topics/:topicId/material-summary')
  summarize(
    @CurrentUser() user: AuthUser,
    @Param('topicId') topicId: string,
  ) {
    return this.ai.summarizeTopicMaterials(user, topicId);
  }

  @Get('meetings/:meetingId/minutes-draft')
  latestMinutes(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
  ) {
    return this.ai.getLatestMinutesDraft(user, meetingId);
  }

  @Post('meetings/:meetingId/minutes-draft')
  draftMinutes(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
  ) {
    return this.ai.draftMeetingMinutes(user, meetingId);
  }
}
