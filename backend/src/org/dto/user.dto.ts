import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan' })
  @IsString()
  @MinLength(2)
  username!: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @MinLength(2)
  realName!: string;

  @ApiPropertyOptional({ example: '副院长' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: '所属学院；学院管理员创建时强制为本院',
  })
  @IsOptional()
  @IsString()
  collegeId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['VICE_SECRETARY', 'PARTY_MEMBER'],
    description: '角色编码列表',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @ApiPropertyOptional({
    description: '初始密码；不传则按策略自动生成（演示环境可能默认为 123456）',
  })
  @IsOptional()
  @IsString()
  password?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  realName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @ApiPropertyOptional({ description: '是否启用账号' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: '校级查阅分管学院；传空数组表示全校',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collegeScopeIds?: string[];
}

export class ResetPasswordDto {
  @ApiProperty({ description: '新密码（须符合口令策略）' })
  @IsString()
  password!: string;
}
