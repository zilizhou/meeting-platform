import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { InspectionExportService } from './inspection-export.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import { GenerateBriefingDto } from './dto/generate-briefing.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleCode.SCHOOL_ADMIN, RoleCode.SCHOOL_VIEWER)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly inspectionExport: InspectionExportService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.admin.overview(user);
  }

  @Post('briefings/generate')
  generateBriefing(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateBriefingDto,
  ) {
    return this.admin.generateSchoolBriefing(user, {
      mode: dto.mode,
      notify: dto.notify,
      collegeId: dto.collegeId,
    });
  }

  @Get('briefings')
  listBriefings(
    @CurrentUser() user: AuthUser,
    @Query('take') take?: string,
    @Query('collegeId') collegeId?: string,
  ) {
    return this.admin.listSchoolBriefings(user, {
      take: take ? Number(take) : 20,
      collegeId,
    });
  }

  @Get('briefings/:id')
  getBriefing(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.getSchoolBriefing(user, id);
  }

  @Get('colleges')
  colleges(@CurrentUser() user: AuthUser) {
    return this.admin.collegeStats(user);
  }

  @Get('meetings')
  meetings(
    @CurrentUser() user: AuthUser,
    @Query('collegeId') collegeId?: string,
    @Query('meetingType') meetingType?: string,
  ) {
    return this.admin.meetingLedger(user, { collegeId, meetingType });
  }

  @Get('warnings')
  warnings(@CurrentUser() user: AuthUser) {
    return this.admin.warnings(user);
  }

  @Get('transfers')
  transfers(
    @CurrentUser() user: AuthUser,
    @Query('collegeId') collegeId?: string,
  ) {
    return this.admin.transfers(user, collegeId);
  }

  @Get('exports/inspection-pack')
  async exportInspectionPack(
    @CurrentUser() user: AuthUser,
    @Query('collegeId') collegeId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, filename } = await this.inspectionExport.exportZip(
      user,
      collegeId,
    );
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }
}
