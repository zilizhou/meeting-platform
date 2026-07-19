import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'secretary' })
  @IsString()
  username!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  password!: string;
}
