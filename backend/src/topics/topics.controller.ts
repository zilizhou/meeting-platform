import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { TopicsService } from './topics.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import {
  AddMaterialDto,
  ConfirmEmergencyDto,
  CreateTopicDto,
  MaterialReadDto,
  PartyResolveDto,
  PublishResolutionDto,
  ReviewTopicDto,
  SetAvoidUsersDto,
  UpdateTopicDto,
} from './dto/topic.dto';

@ApiTags('topics')
@ApiBearerAuth()
@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Post()
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
    RoleCode.VICE_DEAN,
    RoleCode.PARTY_MEMBER,
    RoleCode.DEPT_HEAD,
  )
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTopicDto) {
    return this.topics.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('meetingType') meetingType?: string,
  ) {
    return this.topics.list(user, meetingType);
  }

  /** 材料上传/下载放在 :id 之前，避免被动态路由吞掉 */
  @Post('materials/:materialId/upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
    RoleCode.VICE_DEAN,
    RoleCode.PARTY_MEMBER,
    RoleCode.DEPT_HEAD,
  )
  uploadFile(
    @CurrentUser() user: AuthUser,
    @Param('materialId') materialId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.topics.uploadMaterialFile(user, materialId, file);
  }

  @Get('materials/:materialId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('materialId') materialId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, filename, mimeType } = await this.topics.downloadMaterial(
      user,
      materialId,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }

  @Post('materials/:materialId/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('materialId') materialId: string,
    @Body() dto: MaterialReadDto,
  ) {
    return this.topics.markMaterialRead(user, materialId, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.topics.detail(user, id);
  }

  @Patch(':id')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
    RoleCode.VICE_DEAN,
    RoleCode.PARTY_MEMBER,
    RoleCode.DEPT_HEAD,
  )
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.topics.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
    RoleCode.VICE_DEAN,
    RoleCode.PARTY_MEMBER,
    RoleCode.DEPT_HEAD,
  )
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.topics.remove(user, id);
  }

  @Post(':id/materials')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
  )
  addMaterial(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddMaterialDto,
  ) {
    return this.topics.addMaterial(user, id, dto);
  }

  @Post(':id/avoid-users')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
  )
  setAvoidUsers(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetAvoidUsersDto,
  ) {
    return this.topics.setAvoidUsers(user, id, dto);
  }

  @Post(':id/submit-review')
  @Roles(
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.SECRETARY,
    RoleCode.VICE_SECRETARY,
    RoleCode.DEAN,
    RoleCode.VICE_DEAN,
    RoleCode.PARTY_MEMBER,
    RoleCode.DEPT_HEAD,
  )
  submitReview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.topics.submitForReview(user, id);
  }

  @Post(':id/review')
  @Roles(RoleCode.SECRETARY, RoleCode.DEAN)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewTopicDto,
  ) {
    return this.topics.review(user, id, dto);
  }

  @Post(':id/party-resolve')
  @Roles(RoleCode.SECRETARY)
  partyResolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PartyResolveDto,
  ) {
    return this.topics.partyResolve(user, id, dto);
  }

  @Post(':id/transfer-to-joint')
  @Roles(RoleCode.SECRETARY, RoleCode.MEETING_SECRETARY, RoleCode.COLLEGE_ADMIN)
  transferToJoint(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.topics.transferPartyToJoint(user, id);
  }

  @Post(':id/confirm-emergency')
  @Roles(RoleCode.SECRETARY, RoleCode.DEAN)
  confirmEmergency(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmEmergencyDto,
  ) {
    return this.topics.confirmEmergency(user, id, dto);
  }

  @Post(':id/publish-resolution')
  @Roles(
    RoleCode.SECRETARY,
    RoleCode.DEAN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.COLLEGE_ADMIN,
  )
  publishResolution(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PublishResolutionDto,
  ) {
    return this.topics.publishResolution(user, id, dto);
  }
}
