# Архитектура solo_pr (integration hub)

## Роль

Публичный сайт / поверхность ПДн / BFF-хаб коммерческого центра на **российском официальном облаке (152‑ФЗ)**.

Соседние системы (отдельные репозитории и БД):

- **voronka** — CRM, деньги, AccessGrant (home server).
- **lms_end** — курсы и enforcement доступа (home server).

**Запрещено:** shared DB, merge репозиториев, Cloudflare Workers/D1 как production-путь ПДн.

## Production hosting

| Контур | Назначение |
|--------|------------|
| **VPS / RU cloud** (`npm run build:vps`, Docker Compose + Caddy) | **Единственный production-путь для ПДн** |
| Sites / Cloudflare Worker + D1 (`npm run build`) | Non-PII demo / legacy; **не** для реальных пользователей с ПДн |

См. [VPS.md](./VPS.md), [INTEGRATION.md](./INTEGRATION.md) (принципы SoR / порталы), [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) (карта сервисов), [INTEGRATIONS.md](./INTEGRATIONS.md) (wire), [PORTALS.md](./PORTALS.md).

## Данные

- SQLite + `content.json` в `$DATA_DIR` (mode 0700).
- Документы ЛК: локальный volume `$DATA_DIR/documents` (или внешний HTTPS URL по allowlist).
- Ledger денег — **только** voronka; локальные `purchases` — статус доступа для ЛК (`source=manual|voronka`).

## Non-runtime / hygiene

Следующее **не** является runtime-путём VPS:

- `prisma/` + `@prisma/client` / `prisma` CLI — учебная заглушка; не соответствует схеме портала.
- `src/lib/db.ts` — Prisma client, не импортируется порталом.
- `drizzle/` + `db/schema.ts` + `worker/` — только Sites/D1 demo.
- `next-auth` и `z-ai-web-dev-sdk` **удалены** из dependencies (ранее мёртвый груз).

Скрипты `db:push` / `db:migrate` / `db:reset` намеренно **не** вызывают `--accept-data-loss` и помечены как non-runtime.

## Observability

- `GET /api` и `GET /api/health` — health (`ok`, version, sqlite readable, counters).
- `GET /api/ready` — readiness для reverse proxy.
- JSON-логи: `request_id`, `route`, hashed `user_id`, `status`, `latency_ms`.
- Метрики в SQLite `metrics`: `http_5xx`, `auth_failures`, `lead_sync_failures`, …

Логи на RU VPS: journald / Docker logs → опционально сборщик в том же регионе (см. VPS.md).
