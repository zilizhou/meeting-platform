#!/usr/bin/env bash
# 在 SQLite（本地默认）与 MySQL（生产/联调）之间切换 Prisma schema 与 .env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
PRISMA="$BACKEND/prisma"
ENV_FILE="$BACKEND/.env"

usage() {
  cat <<'EOF'
用法:
  ./scripts/switch-db.sh sqlite   # 切回本地 SQLite
  ./scripts/switch-db.sh mysql    # 切换到 MySQL（需先启动 docker compose）
  ./scripts/switch-db.sh status   # 查看当前 provider

MySQL 首次初始化（需本机有 Docker）:
  docker compose up -d
  ./scripts/switch-db.sh mysql
  cd backend && pnpm exec prisma db push && pnpm prisma:seed
EOF
}

ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$BACKEND/.env.example" "$ENV_FILE"
    echo "已创建 $ENV_FILE"
  fi
}

set_database_url() {
  local url="$1"
  ensure_env
  if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    # macOS / GNU sed 兼容：用临时文件改写
    awk -v u="$url" '
      BEGIN { done=0 }
      /^DATABASE_URL=/ { print "DATABASE_URL=\"" u "\""; done=1; next }
      { print }
      END { if (!done) print "DATABASE_URL=\"" u "\"" }
    ' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    echo "DATABASE_URL=\"$url\"" >> "$ENV_FILE"
  fi
}

current_provider() {
  if [[ -f "$PRISMA/schema.prisma" ]]; then
    awk '
      /^datasource / { in_ds=1 }
      in_ds && /provider[[:space:]]*=/ {
        if (match($0, /"[^"]+"/)) {
          print substr($0, RSTART+1, RLENGTH-2)
          exit
        }
      }
      in_ds && /^}/ { in_ds=0 }
    ' "$PRISMA/schema.prisma"
  else
    echo "missing"
  fi
}

cmd="${1:-}"
case "$cmd" in
  status)
    echo "当前 Prisma provider: $(current_provider)"
    if [[ -f "$ENV_FILE" ]]; then
      grep '^DATABASE_URL=' "$ENV_FILE" || true
    else
      echo "未找到 backend/.env"
    fi
    ;;
  sqlite)
    cp "$PRISMA/schema.sqlite.prisma" "$PRISMA/schema.prisma"
    set_database_url 'file:./dev.db'
    (cd "$BACKEND" && pnpm exec prisma generate)
    echo "已切换到 SQLite。可执行: cd backend && pnpm exec prisma migrate dev && pnpm prisma:seed"
    ;;
  mysql)
    if [[ ! -f "$PRISMA/schema.mysql.prisma" ]]; then
      echo "缺少 $PRISMA/schema.mysql.prisma" >&2
      exit 1
    fi
    cp "$PRISMA/schema.mysql.prisma" "$PRISMA/schema.prisma"
    set_database_url 'mysql://meeting:meeting123@127.0.0.1:3306/qfnu_meeting'
    (cd "$BACKEND" && pnpm exec prisma generate)
    echo "已切换到 MySQL。"
    echo "请确认 MySQL 已启动（docker compose up -d），然后执行:"
    echo "  cd backend && pnpm exec prisma db push && pnpm prisma:seed"
    ;;
  *)
    usage
    exit 1
    ;;
esac
