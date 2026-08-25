-- AlterTable: 审计溯源字段 + 只追加索引
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- 应用层 Prisma 中间件为主；SQLite 触发器作纵深防御（禁止改删审计行）
-- 演示/seed 可通过临时 DROP TRIGGER 或 ALLOW_AUDIT_WIPE（仅应用层）清库
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog is append-only: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog is append-only: DELETE forbidden');
END;
