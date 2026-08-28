import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FeedbackService, FEEDBACK_COLLEGE_ROLES } from './feedback.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';

const FEEDBACK_ROLES = [
  RoleCode.SCHOOL_ADMIN,
  RoleCode.SCHOOL_VIEWER,
  ...FEEDBACK_COLLEGE_ROLES,
] as const;

@ApiTags('feedback')
@ApiBearerAuth()
@Roles(...FEEDBACK_ROLES)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('collegeId') collegeId?: string,
  ) {
    return this.feedback.listThreads(user, collegeId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feedback.getThread(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto) {
    return this.feedback.createThread(user, dto);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplyFeedbackDto,
  ) {
    return this.feedback.reply(user, id, dto.content);
  }
}
