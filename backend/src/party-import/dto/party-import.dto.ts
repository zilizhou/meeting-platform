import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PartyImportTopicDto {
  @ApiProperty()
  @Type(() => Number)
  sortOrder!: number;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolutionSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  minutesSection?: string;
}

class PartyImportPersonDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ enum: ['link', 'create'] })
  @IsIn(['link', 'create'])
  action!: 'link' | 'create';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFormal?: boolean;

  @ApiProperty({ enum: ['attend', 'leave', 'absent', 'avoid'] })
  @IsIn(['attend', 'leave', 'absent', 'avoid'])
  status!: 'attend' | 'leave' | 'absent' | 'avoid';
}

class PartyImportRawDto {
  @ApiProperty()
  @IsString()
  agendaText!: string;

  @ApiProperty()
  @IsString()
  recordText!: string;

  @ApiProperty()
  @IsString()
  minutesText!: string;
}

export class PartyImportConfirmBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collegeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hostName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recorderName?: string;

  @ApiProperty({ type: [PartyImportTopicDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyImportTopicDto)
  topics!: PartyImportTopicDto[];

  @ApiProperty({ type: [PartyImportPersonDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyImportPersonDto)
  people!: PartyImportPersonDto[];

  @ApiProperty()
  @IsString()
  minutesContent!: string;

  @ApiProperty({ type: PartyImportRawDto })
  @ValidateNested()
  @Type(() => PartyImportRawDto)
  raw!: PartyImportRawDto;
}
