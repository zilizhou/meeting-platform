import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class GenerateBriefingDto {
  @IsOptional()
  @IsIn(['monthly', 'realtime'])
  mode?: 'monthly' | 'realtime';

  /** 是否推送到校级管理员消息中心 */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
