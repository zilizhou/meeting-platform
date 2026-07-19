import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArchivesService } from './archives.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';

@ApiTags('archives')
@ApiBearerAuth()
@Controller('archives')
export class ArchivesController {
  constructor(private readonly archives: ArchivesService) {}

  @Get()
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('meetingType') meetingType?: string,
    @Query('isMajor') isMajor?: string,
    @Query('isPublic') isPublic?: string,
    @Query('year') year?: string,
    @Query('status') status?: string,
  ) {
    return this.archives.search(user, {
      q,
      meetingType,
      isMajor:
        isMajor === 'true' ? true : isMajor === 'false' ? false : undefined,
      isPublic:
        isPublic === 'true' ? true : isPublic === 'false' ? false : undefined,
      year: year ? Number(year) : undefined,
      status,
    });
  }

  @Get('meetings/:id')
  dossier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.archives.dossier(user, id);
  }
}
