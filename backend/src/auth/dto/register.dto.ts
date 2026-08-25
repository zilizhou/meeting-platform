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
  @ApiProperty({ example: 'zhangsan', description: '登录账号' })
  @Transform(({ value }) => trim(value))
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{1,31}$/, {
    message: '账号须以字母开头，仅含字母、数字和下划线，长度 2～32 位',
  })
  username!: string;

  @ApiProperty({ example: '张三' })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(2, { message: '姓名至少 2 个字' })
  @MaxLength(32, { message: '姓名过长' })
  realName!: string;

  @ApiPropertyOptional({ example: '教研室主任' })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '职务过长' })
  title?: string;

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
