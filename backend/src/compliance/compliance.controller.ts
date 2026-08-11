import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import { prismaCollegeIdFilter } from '../common/roles';

@ApiTags('compliance')
@ApiBearerAuth()
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('logs')
  @Roles(
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
    RoleCode.SCHOOL_ADMIN,
    RoleCode.SCHOOL_VIEWER,
  )
  async logs(
    @CurrentUser() user: AuthUser,
    @Query('topicId') topicId?: string,
    @Query('meetingId') meetingId?: string,
  ) {
    return this.prisma.complianceLog.findMany({
      where: {
        ...prismaCollegeIdFilter(user),
        ...(topicId ? { topicId } : {}),
        ...(meetingId ? { meetingId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
