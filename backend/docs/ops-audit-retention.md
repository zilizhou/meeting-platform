# 审计日志留存与只追加说明（等保二级 / PR-B）

## 目标

- 关键操作可追溯：登录成功/失败、改密、重置密码、禁用账号、材料下载、巡视导出、会议归档等
- 审计记录**只追加**：业务与管理端均不可改、不可删
- 在线留存 **不少于 6 个月**（默认 180 天，可配 `AUDIT_RETENTION_DAYS`）

## 实现要点

| 层级 | 机制 |
|------|------|
| 应用 | `AuditService.log` 自动带入请求 IP / User-Agent（`RequestContextMiddleware`） |
| 应用 | Prisma `$use` 拦截 `AuditLog` 的 update / delete / upsert |
| 数据库（SQLite） | `BEFORE UPDATE/DELETE` 触发器拒绝改删 |
| 配置 | `AUDIT_RETENTION_DAYS`（默认 180）；**系统不提供一键清空** |
| 演示清库 | 仅 `prisma db seed` 在临时 `ALLOW_AUDIT_WIPE=1` 且 drop 触发器后清库，结束后恢复触发器 |

## 运维要求

1. **生产环境禁止**设置 `ALLOW_AUDIT_WIPE=1`。
2. 到期归档：将库中早于留存窗口的审计导出为离线介质（CSV/JSON）后，由**制度审批**后手工删除；应用内不做自动 purge。
3. 查询：`GET /api/audit/logs?since=...&action=LOGIN_FAIL`；策略：`GET /api/audit/policy`。
4. 备份：审计表与业务库一并纳入定期备份；恢复演练时不得用“抹审计”方式掩盖事故。

## 关键动作一览（PR-B）

- `LOGIN` / `LOGIN_FAIL` / `LOGOUT` / `CHANGE_PASSWORD` / `RESET_PASSWORD`
- `DISABLE_USER` / `ENABLE_USER` / `UPDATE`（用户）
- `DOWNLOAD`（议题材料）
- `EXPORT_INSPECTION_PACK`（巡视材料包）
- `ARCHIVE`（会议归档）
