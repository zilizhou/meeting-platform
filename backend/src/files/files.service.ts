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

/**
 * Multer/busboy 默认按 latin1 解析 Content-Disposition 文件名，
 * 浏览器实际发送的是 UTF-8，中文会变成「å±±ä¸œ」这类乱码。
 */
export function decodeUploadFilename(name: string | null | undefined): string {
  if (!name) return '';
  if (/[\u4e00-\u9fff]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded || decoded.includes('\uFFFD')) return name;
    if (/[\u4e00-\u9fff]/.test(decoded)) return decoded;
  } catch {
    return name;
  }
  return name;
}

export function repairStoredFilenameFields<T extends {
  originalName?: string | null;
  content?: string | null;
}>(row: T): T {
  const raw = row.originalName;
  if (!raw) return row;
  const originalName = decodeUploadFilename(raw);
  if (originalName === raw) return row;
  let content = row.content ?? null;
  if (content?.includes(raw)) {
    content = content.split(raw).join(originalName);
  }
  return { ...row, originalName, content };
}

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

  decodeOriginalName(originalName: string) {
    return decodeUploadFilename(originalName);
  }

  normalizeMulterFile(file: Express.Multer.File) {
    file.originalname = decodeUploadFilename(file.originalname);
    return file;
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

  ensureMeetingDir(collegeId: string, meetingId: string) {
    const dir = join(this.uploadRoot, collegeId, 'meetings', meetingId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  relativeMeetingPath(collegeId: string, meetingId: string, storedName: string) {
    return join(collegeId, 'meetings', meetingId, storedName).replace(
      /\\/g,
      '/',
    );
  }
}
