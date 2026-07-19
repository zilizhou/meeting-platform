import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import {
  CreateMeetingDto,
  DiscussDto,
  LeaveDto,
  MinutesDto,
  AbsentOpinionDto,
  ResolveDto,
  VoteDto,
} from './dto/meeting.dto';

@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
  )
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('meetingType') meetingType?: string,
    @Query('status') status?: string,
  ) {
    return this.meetings.list(user, meetingType, status);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.detail(user, id);
  }

  @Post(':id/start')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
  )
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.start(user, id);
  }

  @Post(':id/end')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
  )
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.end(user, id);
  }

  @Post(':id/checkin')
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('userId') userId?: string,
  ) {
    return this.meetings.checkIn(user, id, userId);
  }

  @Post(':id/leave')
  leave(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveDto,
  ) {
    return this.meetings.requestLeave(user, id, dto);
  }

  @Post(':id/archive')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
  )
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.archive(user, id);
  }

  @Post(':id/topics/:topicId/discuss')
  discuss(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Body() dto: DiscussDto,
  ) {
    return this.meetings.discuss(user, id, topicId, dto);
  }

  @Post(':id/topics/:topicId/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Body() dto: VoteDto,
  ) {
    return this.meetings.vote(user, id, topicId, dto);
  }

  @Post(':id/topics/:topicId/absent-opinion')
  absentOpinion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Body() dto: AbsentOpinionDto,
  ) {
    return this.meetings.submitAbsentOpinion(user, id, topicId, dto);
  }

  @Post(':id/topics/:topicId/vote-all-approve')
  @Roles(RoleCode.MEETING_SECRETARY, RoleCode.COLLEGE_ADMIN)
  voteAllApprove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
  ) {
    return this.meetings.voteAllApprove(user, id, topicId);
  }

  @Post(':id/topics/:topicId/resolve')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
  )
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Body() dto: ResolveDto,
  ) {
    return this.meetings.resolve(user, id, topicId, dto);
  }

  @Post(':id/minutes')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
  )
  saveMinutes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MinutesDto,
  ) {
    return this.meetings.saveMinutes(user, id, dto);
  }

  @Post(':id/minutes/sign')
  @Roles(RoleCode.SECRETARY, RoleCode.VICE_SECRETARY, RoleCode.DEAN)
  signMinutes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.signMinutes(user, id);
  }
}
