import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTopicDto {
  @ApiProperty({ example: '关于2026年度学科建设规划的议案' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: ['JOINT_CONFERENCE', 'PARTY_COMMITTEE'],
    default: 'JOINT_CONFERENCE',
  })
  @IsOptional()
  @IsIn(['JOINT_CONFERENCE', 'PARTY_COMMITTEE'])
  meetingType?: 'JOINT_CONFERENCE' | 'PARTY_COMMITTEE';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  needPartyPrecheck?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedPartyResolutionId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMajor?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTempMotion?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: '紧急临机处置：事后补报联席会确认（规则第十三条）',
  })
  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  /** 党组织会议决议后是否标记需转联席会 */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  transferToJoint?: boolean;
}

export class UpdateTopicDto {
  @ApiPropertyOptional({ example: '关于2026年度学科建设规划的议案' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  needPartyPrecheck?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedPartyResolutionId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMajor?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTempMotion?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;
}

export class ReviewTopicDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsString()
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: '学院管理员/会议秘书代审' })
  @IsOptional()
  @IsBoolean()
  proxy?: boolean;

  @ApiPropertyOptional({ enum: ['PHONE', 'IN_PERSON'] })
  @IsOptional()
  @IsIn(['PHONE', 'IN_PERSON'])
  proxyMethod?: 'PHONE' | 'IN_PERSON';

  @ApiPropertyOptional({ description: '代审确认的对方姓名' })
  @IsOptional()
  @IsString()
  proxyCounterparty?: string;

  @ApiPropertyOptional({
    enum: ['SECRETARY', 'DEAN'],
    description: '联席会议题代审时指定一侧',
  })
  @IsOptional()
  @IsIn(['SECRETARY', 'DEAN'])
  proxySide?: 'SECRETARY' | 'DEAN';
}

export class AddMaterialDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requiredKey?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class SetAvoidUsersDto {
  @ApiProperty({ type: [String], description: '需回避的用户 ID 列表' })
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class MaterialReadDto {
  @ApiPropertyOptional({ description: '阅件备注（可选）' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class PartyResolveDto {
  @ApiProperty({
    enum: ['APPROVED', 'PRINCIPLE_APPROVED', 'DEFERRED', 'REJECTED'],
  })
  @IsString()
  resultType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '督办责任人用户 ID，默认当前书记' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({
    description: '是否转党政联席会审议/落实',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  transferToJoint?: boolean;
}

export class ConfirmEmergencyDto {
  @ApiPropertyOptional({ description: '补确认说明' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class PublishResolutionDto {
  @ApiProperty({ description: '是否按规定公开' })
  @IsBoolean()
  isPublic!: boolean;

  @ApiPropertyOptional({
    enum: ['PUBLIC', 'INTERNAL', 'SECRET'],
    description: '保密级别',
  })
  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'SECRET'])
  securityLevel?: 'PUBLIC' | 'INTERNAL' | 'SECRET';
}
