import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FrequencyRuleItemDto {
  @ApiProperty({ enum: ['PARTY_COMMITTEE', 'JOINT_CONFERENCE'] })
  @IsIn(['PARTY_COMMITTEE', 'JOINT_CONFERENCE'])
  meetingType!: 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE';

  @ApiProperty({ enum: ['SEMESTER', 'MONTH'] })
  @IsIn(['SEMESTER', 'MONTH'])
  period!: 'SEMESTER' | 'MONTH';

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredCount!: number;

  @ApiPropertyOptional({ description: '空或省略表示全校默认' })
  @IsOptional()
  @IsString()
  collegeId?: string;
}

export class UpsertFrequencyRulesDto {
  @ApiProperty({ type: [FrequencyRuleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FrequencyRuleItemDto)
  rules!: FrequencyRuleItemDto[];
}
