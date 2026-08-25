# 暴露面加固（等保二级 / PR-C）

## 目标

- 生产不暴露 API 文档（Swagger）
- 接口限流，登录更严，抑制撞库与刷接口
- 安全响应头（helmet）
- 生产错误不回传堆栈

## 行为

| 项 | 默认（生产） | 覆盖 |
|----|--------------|------|
| Swagger `/api/docs` | 关闭 | `ENABLE_SWAGGER=1` |
| 监听地址 | `127.0.0.1`（仅本机，经 nginx） | `BIND_HOST=0.0.0.0` |
| 全局限流 | 120 次 / 60s / IP | `THROTTLE_LIMIT` / `THROTTLE_TTL_MS` |
| 登录限流 | 20 次 / 60s / IP | `THROTTLE_LOGIN_LIMIT` / `THROTTLE_LOGIN_TTL_MS` |
| 安全头 | helmet（CSP 关闭，适合纯 API） | — |
| 5xx | 仅「服务器内部错误」 | 非生产可回 message/stack |

## 验收

1. `NODE_ENV=production` 时 `GET /api/docs` → 404  
2. 响应含 `X-Content-Type-Options: nosniff` 等  
3. 短时反复 `POST /api/auth/login` → 429  
4. 业务端经 nginx `:5173/api` 登录仍正常  
