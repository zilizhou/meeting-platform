import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser, Roles } from '../common/decorators';
import { RoleCode } from '../common/constants';
import { AuthUser } from '../common/types';
import { PartyImportService } from './party-import.service';
import { MeetingImportConfirmDto } from './party-import.types';

const IMPORT_ROLES = [
  RoleCode.MEETING_SECRETARY,
  RoleCode.COLLEGE_ADMIN,
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
  RoleCode.DEAN,
] as const;

const fileFields = FileFieldsInterceptor(
  [
    { name: 'agenda', maxCount: 1 },
    { name: 'record', maxCount: 1 },
    { name: 'minutes', maxCount: 1 },
  ],
  {
    storage: memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
  },
);

@ApiTags('meeting-import')
@ApiBearerAuth()
@Controller()
export class PartyImportController {
  constructor(private readonly partyImport: PartyImportService) {}

  @Post(['meeting-import/preview', 'party-import/preview'])
  @Roles(...IMPORT_ROLES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        agenda: { type: 'string', format: 'binary' },
        record: { type: 'string', format: 'binary' },
        minutes: { type: 'string', format: 'binary' },
        meetingType: {
          type: 'string',
          enum: ['auto', 'PARTY_COMMITTEE', 'JOINT_CONFERENCE'],
        },
      },
      required: ['agenda', 'record', 'minutes'],
    },
  })
  @UseInterceptors(fileFields)
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFiles()
    files: {
      agenda?: Express.Multer.File[];
      record?: Express.Multer.File[];
      minutes?: Express.Multer.File[];
    },
    @Query('meetingType') meetingTypeQ?: string,
    @Body('meetingType') meetingTypeB?: string,
  ) {
    const hint = meetingTypeB || meetingTypeQ;
    return this.partyImport.preview(
      user,
      {
        agenda: files?.agenda?.[0],
        record: files?.record?.[0],
        minutes: files?.minutes?.[0],
      },
      hint === 'auto' ? undefined : hint,
    );
  }

  @Post(['meeting-import/confirm', 'party-import/confirm'])
  @Roles(...IMPORT_ROLES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        agenda: { type: 'string', format: 'binary' },
        record: { type: 'string', format: 'binary' },
        minutes: { type: 'string', format: 'binary' },
        payload: {
          type: 'string',
          description: 'MeetingImportConfirmDto JSON',
        },
      },
      required: ['agenda', 'record', 'minutes', 'payload'],
    },
  })
  @UseInterceptors(fileFields)
  confirm(
    @CurrentUser() user: AuthUser,
    @UploadedFiles()
    files: {
      agenda?: Express.Multer.File[];
      record?: Express.Multer.File[];
      minutes?: Express.Multer.File[];
    },
    @Body('payload') payloadRaw: string,
  ) {
    let dto: MeetingImportConfirmDto;
    try {
      dto = JSON.parse(payloadRaw) as MeetingImportConfirmDto;
    } catch {
      throw new BadRequestException('payload 不是合法 JSON');
    }

    // 兼容旧版单场 payload：无 meetings 数组时包一层
    if (!dto.meetings && (dto as any).topics) {
      const legacy = dto as any;
      dto = {
        meetingType: legacy.meetingType || 'PARTY_COMMITTEE',
        collegeId: legacy.collegeId,
        meetings: [
          {
            key: 'legacy-0',
            selected: true,
            alignStatus: 'ok',
            periodNo: legacy.periodNo || null,
            scheduledAt: legacy.scheduledAt || null,
            location: legacy.location || '',
            title: legacy.title || '',
            hostName: legacy.hostName || '',
            recorderName: legacy.recorderName || '',
            topics: legacy.topics,
            people: legacy.people,
            minutesContent: legacy.minutesContent,
            warnings: [],
            raw: legacy.raw,
          },
        ],
      };
    }

    if (!dto?.meetings?.length) {
      throw new BadRequestException('payload 缺少 meetings');
    }
    return this.partyImport.confirm(user, dto, {
      agenda: files?.agenda?.[0],
      record: files?.record?.[0],
      minutes: files?.minutes?.[0],
    });
  }
}
