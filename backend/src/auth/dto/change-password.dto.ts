import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(4)
  newPassword!: string;
}
