import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMeetingDto {
  @ApiProperty({ example: '计算机学院2026年第3次党政联席会议' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  periodNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMajor?: boolean;

  @ApiPropertyOptional({
    enum: ['JOINT_CONFERENCE', 'PARTY_COMMITTEE'],
    default: 'JOINT_CONFERENCE',
  })
  @IsOptional()
  @IsIn(['JOINT_CONFERENCE', 'PARTY_COMMITTEE'])
  meetingType?: 'JOINT_CONFERENCE' | 'PARTY_COMMITTEE';

  @ApiProperty({ type: [String], description: '入会议题（至少 1 项）' })
  @IsArray()
  @ArrayMinSize(1, { message: '创建会议至少选择一项议题' })
  @IsString({ each: true })
  topicIds!: string[];
}

export class DiscussDto {
  @ApiProperty({ enum: ['AGREE', 'DISAGREE', 'DEFER'] })
  @IsString()
  opinion!: 'AGREE' | 'DISAGREE' | 'DEFER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}

export class VoteDto {
  @ApiProperty({ enum: ['ORAL', 'HAND', 'BALLOT'] })
  @IsString()
  method!: 'ORAL' | 'HAND' | 'BALLOT';

  @ApiProperty()
  @IsBoolean()
  approve!: boolean;
}

export class AbsentOpinionDto {
  @ApiProperty({ description: '书面意见：是否赞成' })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ description: '缺席事由/意见说明' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '会务代登时指定正式成员' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class ResolveDto {
  @ApiProperty({
    enum: ['APPROVED', 'PRINCIPLE_APPROVED', 'DEFERRED', 'REJECTED'],
  })
  @IsString()
  resultType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;

  /** 党组织会议会中决议后是否转联席会 */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  transferToJoint?: boolean;

  @ApiPropertyOptional({ default: false, description: '是否按规定公开' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    enum: ['PUBLIC', 'INTERNAL', 'SECRET'],
    default: 'INTERNAL',
  })
  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'SECRET'])
  securityLevel?: 'PUBLIC' | 'INTERNAL' | 'SECRET';
}

export class MinutesDto {
  @ApiProperty()
  @IsString()
  content!: string;
}

export class LeaveDto {
  @ApiProperty({ example: '因公出差，会前向主持人报备' })
  @IsString()
  @MinLength(2)
  reason!: string;
}
