import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertRosterDto {
  @ApiProperty()
  @IsString()
  collegeId!: string;

  @ApiProperty({ enum: ['PARTY_COMMITTEE', 'JOINT_CONFERENCE'] })
  @IsIn(['PARTY_COMMITTEE', 'JOINT_CONFERENCE'])
  meetingType!: string;

  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isFormal?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateRosterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFormal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
