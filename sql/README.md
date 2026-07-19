# SQL 脚本说明

| 文件 | 用途 |
|------|------|
| `001_init.sql` | 早期 SQLite 风格建表参考（与当前 Prisma migrate 可能不完全同步，本地请优先用 `prisma migrate`） |
| `002_mysql_init.sql` | 由 `backend/prisma/schema.mysql.prisma` 生成的 MySQL 8 建表脚本 |

推荐初始化方式：

- **SQLite**：`cd backend && pnpm exec prisma migrate dev`
- **MySQL**：`docker compose up -d` → `./scripts/switch-db.sh mysql` → `pnpm exec prisma db push`
