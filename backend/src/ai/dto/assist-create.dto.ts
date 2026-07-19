import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssistCreateDto {
  @ApiPropertyOptional({
    description: '自然语言描述（征集入口优先）；与 title 至少填一项',
    example: '系里想引进两名密码方向学科带头人，需要安家费和团队启动经费',
  })
  @ValidateIf((o: AssistCreateDto) => !o.title?.trim())
  @IsString()
  @MinLength(4)
  description?: string;

  @ApiPropertyOptional({ example: '关于引进高层次人才的议案' })
  @ValidateIf((o: AssistCreateDto) => !o.description?.trim())
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    enum: ['JOINT_CONFERENCE', 'PARTY_COMMITTEE'],
    default: 'JOINT_CONFERENCE',
  })
  @IsOptional()
  @IsIn(['JOINT_CONFERENCE', 'PARTY_COMMITTEE'])
  meetingType?: 'JOINT_CONFERENCE' | 'PARTY_COMMITTEE';
}
