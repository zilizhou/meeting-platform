import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const AUDIT_MUTATION_MSG =
  '审计日志只追加：禁止修改或删除 AuditLog（等保审计留存）';

function assertAuditAppendOnly(params: {
  model?: string;
  action: string;
}) {
  if (params.model !== 'AuditLog') return;
  if (process.env.ALLOW_AUDIT_WIPE === '1') return;
  const blocked = new Set([
    'update',
    'updateMany',
    'delete',
    'deleteMany',
    'upsert',
  ]);
  if (blocked.has(params.action)) {
    throw new Error(AUDIT_MUTATION_MSG);
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    this.$use(async (params, next) => {
      assertAuditAppendOnly({
        model: params.model,
        action: params.action,
      });
      return next(params);
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** 供 seed 等脚本使用：在 ALLOW_AUDIT_WIPE=1 下挂同一套客户端扩展 */
export function attachAuditAppendOnlyGuard(client: PrismaClient) {
  client.$use(async (params, next) => {
    assertAuditAppendOnly({
      model: params.model,
      action: params.action,
    });
    return next(params);
  });
}

export type { Prisma };
