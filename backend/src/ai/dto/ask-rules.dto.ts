import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AskRulesDto {
  @ApiProperty({ example: '缺席书面意见算不算票？' })
  @IsString()
  @MinLength(2)
  question!: string;

  @ApiPropertyOptional({ description: '可选学院上下文（仅审计）' })
  @IsOptional()
  @IsString()
  collegeId?: string;
}
