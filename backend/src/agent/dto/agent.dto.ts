import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgentChatDto {
  @ApiProperty({ example: '我有哪些待办？' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description: '页面上下文：路由、议题、会议',
  })
  @IsOptional()
  @IsObject()
  context?: {
    route?: string;
    topicId?: string;
    meetingId?: string;
  };
}

export class AgentConfirmDto {
  @ApiProperty({ description: '是否确认执行' })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({ description: '用户补充意见（审题/表决等）' })
  @IsOptional()
  @IsString()
  comment?: string;
}
