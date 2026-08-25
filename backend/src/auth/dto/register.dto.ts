import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDto {
  @ApiProperty({ example: '2021001001', description: '学工号，同时作为登录账号' })
  @Transform(({ value }) => trim(value))
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,19}$/, {
    message: '请填写学工号（4～20 位字母或数字）',
  })
  username!: string;

  @ApiProperty({ example: '张三' })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(2, { message: '姓名至少 2 个字' })
  @MaxLength(32, { message: '姓名过长' })
  realName!: string;

  @ApiPropertyOptional({
    example: 'DEPT_HEAD',
    description: '角色编码；不传则默认为列席人员',
  })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiProperty({ description: '所属学院 ID' })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1, { message: '请选择所属学院' })
  collegeId!: string;

  @ApiProperty({ description: '登录密码（须符合口令策略）' })
  @IsString()
  @MinLength(4, { message: '请设置密码' })
  password!: string;

  @ApiProperty({ description: '确认密码' })
  @IsString()
  confirmPassword!: string;
}
