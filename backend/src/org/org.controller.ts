import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrgService } from './org.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { MeetingType, RoleCode } from '../common/constants';
import { UpdateRosterDto, UpsertRosterDto } from './dto/roster.dto';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';

@ApiTags('org')
@ApiBearerAuth()
@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('colleges')
  colleges(@CurrentUser() user: AuthUser) {
    return this.org.listColleges(user);
  }

  @Get('roles')
  roles(@CurrentUser() user: AuthUser) {
    return this.org.listRoles(user);
  }

  @Get('users')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.MEETING_SECRETARY,
    RoleCode.DEAN,
    RoleCode.SCHOOL_ADMIN,
  )
  users(@CurrentUser() user: AuthUser, @Query('collegeId') collegeId?: string) {
    return this.org.listUsers(user, collegeId);
  }

  @Post('users')
  @Roles(RoleCode.COLLEGE_ADMIN, RoleCode.SECRETARY, RoleCode.SCHOOL_ADMIN)
  createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.org.createUser(user, dto);
  }

  @Patch('users/:id')
  @Roles(RoleCode.COLLEGE_ADMIN, RoleCode.SECRETARY, RoleCode.SCHOOL_ADMIN)
  updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.org.updateUser(user, id, dto);
  }

  @Post('users/:id/reset-password')
  @Roles(RoleCode.COLLEGE_ADMIN, RoleCode.SECRETARY, RoleCode.SCHOOL_ADMIN)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.org.resetPassword(user, id, dto);
  }

  @Post('users/:id/enable')
  @Roles(RoleCode.COLLEGE_ADMIN, RoleCode.SECRETARY, RoleCode.SCHOOL_ADMIN)
  enable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.org.setEnabled(user, id, true);
  }

  @Post('users/:id/disable')
  @Roles(RoleCode.COLLEGE_ADMIN, RoleCode.SECRETARY, RoleCode.SCHOOL_ADMIN)
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.org.setEnabled(user, id, false);
  }

  @Delete('users/:id')
  @Roles(RoleCode.COLLEGE_ADMIN, RoleCode.SECRETARY, RoleCode.SCHOOL_ADMIN)
  deleteUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.org.deleteUser(user, id);
  }

  @Get('roster')
  roster(
    @CurrentUser() user: AuthUser,
    @Query('collegeId') collegeId: string,
    @Query('meetingType') meetingType = MeetingType.JOINT_CONFERENCE,
  ) {
    return this.org.getRoster(user, collegeId, meetingType);
  }

  @Post('roster')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.SCHOOL_ADMIN,
  )
  upsertRoster(@CurrentUser() user: AuthUser, @Body() dto: UpsertRosterDto) {
    return this.org.upsertRoster(user, dto);
  }

  @Patch('roster/:id')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.SCHOOL_ADMIN,
  )
  updateRoster(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRosterDto,
  ) {
    return this.org.updateRoster(user, id, dto);
  }

  @Delete('roster/:id')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.SCHOOL_ADMIN,
  )
  removeRoster(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.org.removeRoster(user, id);
  }

  @Get('categories')
  categories(
    @CurrentUser() user: AuthUser,
    @Query('meetingType') meetingType = MeetingType.JOINT_CONFERENCE,
  ) {
    return this.org.listCategories(user, meetingType);
  }
}
