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
    example: '123456',
    description: '初始密码，默认 123456',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
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
}

export class ResetPasswordDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  password!: string;
}
