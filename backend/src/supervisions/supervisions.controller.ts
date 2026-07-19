import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FeedbackDto, SupervisionsService } from './supervisions.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';

@ApiTags('supervisions')
@ApiBearerAuth()
@Controller('supervisions')
export class SupervisionsController {
  constructor(private readonly supervisions: SupervisionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.supervisions.list(user);
  }

  /** 手动触发逾期扫描（列表接口也会自动扫描） */
  @Post('scan-overdue')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
    RoleCode.SCHOOL_ADMIN,
    RoleCode.SCHOOL_VIEWER,
  )
  scanOverdue(@CurrentUser() user: AuthUser) {
    return this.supervisions.scanOverdue(user, true);
  }

  @Post(':id/feedback')
  feedback(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.supervisions.feedback(user, id, dto.content);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.supervisions.complete(user, id);
  }

  @Post(':id/urge')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
  )
  urge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.supervisions.urge(user, id);
  }

  @Post(':id/request-adjust')
  requestAdjust(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.supervisions.requestAdjust(user, id, dto.content);
  }
}
