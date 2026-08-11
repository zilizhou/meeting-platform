import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class GenerateBriefingDto {
  @IsOptional()
  @IsIn(['monthly', 'realtime'])
  mode?: 'monthly' | 'realtime';

  /** 是否推送到校级管理员消息中心 */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;

  /** 指定学院；空则按当前账号可见范围（全校或分管） */
  @IsOptional()
  @IsString()
  collegeId?: string;
}
