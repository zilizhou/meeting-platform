import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCollegeDto {
  @ApiProperty({ example: '数学科学学院' })
  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateCollegeDto {
  @ApiProperty({ example: '数学科学学院' })
  @IsString()
  @MinLength(2)
  name!: string;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'JOINT_CONFERENCE' })
  @IsString()
  meetingType!: string;

  @ApiProperty({ example: 'CUSTOM' })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiProperty({ example: '自定义分类' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ description: '空=校级模板；指定则为学院覆盖' })
  @IsOptional()
  @IsString()
  collegeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needPrecheck?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needPrecheck?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateSystemUserDto {
  @ApiProperty({ example: 'admin2' })
  @IsString()
  @MinLength(2)
  username!: string;

  @ApiProperty({ example: '校级管理员乙' })
  @IsString()
  @MinLength(2)
  realName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: '学院用户必填；创建校级管理员时可不传',
  })
  @IsOptional()
  @IsString()
  collegeId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '含 SCHOOL_ADMIN 时创建校级账号',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ description: '是否校级管理员账号' })
  @IsOptional()
  @IsBoolean()
  isSchoolAdmin?: boolean;
}
