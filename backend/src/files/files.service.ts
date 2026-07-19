import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

const ALLOWED_EXT = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.txt',
  '.zip',
  '.rar',
]);

@Injectable()
export class FilesService {
  readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot =
      this.config.get<string>('UPLOAD_DIR') ||
      join(process.cwd(), 'uploads');
    if (!existsSync(this.uploadRoot)) {
      mkdirSync(this.uploadRoot, { recursive: true });
    }
  }

  assertAllowed(originalName: string, mimeType?: string) {
    const ext = this.getExt(originalName);
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        `不支持的文件类型：${ext || '未知'}。允许：${[...ALLOWED_EXT].join(' ')}`,
      );
    }
    // 简单拦截可执行类
    if (mimeType && /executable|x-msdownload|x-sh/i.test(mimeType)) {
      throw new BadRequestException('不允许上传可执行文件');
    }
  }

  getExt(name: string) {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx).toLowerCase() : '';
  }

  buildStoredName(originalName: string) {
    const ext = this.getExt(originalName) || '.bin';
    return `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  }

  /** 相对路径：collegeId/topicId/filename */
  relativePath(collegeId: string, topicId: string, storedName: string) {
    return join(collegeId, topicId, storedName).replace(/\\/g, '/');
  }

  absolutePath(relativePath: string) {
    // 防路径穿越
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new BadRequestException('非法文件路径');
    }
    return join(this.uploadRoot, normalized);
  }

  ensureTopicDir(collegeId: string, topicId: string) {
    const dir = join(this.uploadRoot, collegeId, topicId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
}
