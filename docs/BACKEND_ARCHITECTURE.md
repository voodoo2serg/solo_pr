# Backend architecture map

Карта сервисов, портов, владения данными и env-контрактов для коммерческого центра **solo_pr × voronka × lms_end × Mailu**.  
Принципы и SoR: [INTEGRATION.md](./INTEGRATION.md). Wire payload: [INTEGRATIONS.md](./INTEGRATIONS.md).  
**Секретов в этом файле нет.** Значения — только имена переменных.

---

## 1. Сервисы и порты (loopback на VPS / home)

| Сервис | Типичный bind | Публичный host | Репозиторий / путь |
|--------|---------------|----------------|--------------------|
| solo_pr (Next VPS) | `127.0.0.1:3010` (compose app `:3000`) | `solo-pr.ru`, `cms.solo-pr.ru` | `solo_pr` |
| site_sv (соседний сайт) | `127.0.0.1:3000` | `vodopetov.ru` | вне этого хаба |
| voronka API + CRM + ops | `127.0.0.1:18080` → container `:8000` | `crm.solo-pr.ru`, `voronka.solo-pr.ru` (+ legacy sslip) | `voronka` |
| voronka Postgres `funnel` | internal `:5432` | — | compose `db` |
| voronka Redis | internal `:6379` | — | compose `redis` |
| Mailu front | `127.0.0.1:8080` | `mail.vodopetov.ru` | `/opt/mailu` (ops) |
| Mailu SMTP/IMAP | `:25/:465/:587/:993` | MX `mail.vodopetov.ru` | Mailu |
| lms_end portal (Next) | `:3040` (dev) | цель `lms.solo-pr.ru` | `lms_end/portal` |
| lms_end adapter API | `127.0.0.1:${LMS_API_PORT}` (default в compose.lms **18080** — **не** делить с voronka на одном хосте) | path `/api/*` под `lms.` | `lms_end` `compose.lms.yaml` |
| Keycloak | `127.0.0.1:18081` | цель `auth.solo-pr.ru` | compose.lms |
| OpenOlat | `127.0.0.1:18082` | цель `lms.` / `learn.` | compose.lms |
| learning-db (adapter PG) | internal `:5432` | — | отдельная БД от `funnel` |
| RAGA / Ollama (AI draft) | `:3005` / `:8000` / internal | `raga.vodopetov.ru` | соседний стек |
| BBB media plane | **не установлен** | внешний host (TBD) | вне текущего VPS |
| nginx / Caddy edge | `:80/:443` | все публичные имена | хост |

### Конфликт портов (важно)

На одном хосте **voronka уже занимает `18080`**. При подъёме `compose.lms.yaml` задайте **`LMS_API_PORT` ≠ 18080** (например `18083`) и пропишите upstream в nginx. Default в примере compose — наследие монорепы; не копировать слепо на shared VPS.

---

## 2. Владение данными

| Store | Владелец | Содержимое |
|-------|----------|------------|
| `$DATA_DIR/community.sqlite` + `content.json` | solo_pr | users, sessions, leads, purchases (LK flags), staff_roles, CMS content, media meta, outbox, integration_events |
| `$DATA_DIR/documents` | solo_pr | файлы ЛК |
| Postgres `funnel` | voronka | profiles, identities, deals, orders, payments, grants, campaigns, outbox, connections, media meta |
| Redis | voronka | очереди / rate / worker coordination |
| Media volume | voronka | кружки / bot assets |
| Mailu DB + maildirs | Mailu | ящики vodopetov.ru |
| OpenOlat DB/FS | OpenOlat | курсы, работы, оценки |
| Keycloak DB | Keycloak | realm users / groups |
| Postgres `lms_adapter` | lms_end | enrollment projection, meeting stubs SoR |
| Portal in-memory / local store | lms_end portal | stub meetings **если** `LMS_END_URL` пуст |

**Нет FK** между SQLite сайта, `funnel` и learning DB. Связь — external id + signed events.

---

## 3. Env contracts (по контуру)

### 3.1 solo_pr

| Переменная | Назначение |
|------------|------------|
| `DATA_DIR`, `COOKIE_SECURE`, `SITE_ORIGIN` | runtime / cookies |
| `VORONKA_WEBHOOK_URL`, `VORONKA_WEBHOOK_SECRET` | outbound `lead.created` |
| `VORONKA_INBOUND_SECRET` | inbound `deal.paid` / `access.*` |
| `VORONKA_BASE_URL`, `VORONKA_ENABLED` | BFF ping / deep links |
| `LMS_BASE_URL`, `LMS_API_SECRET`, `LMS_ENABLED` | enrollment status / handoff |
| `OIDC_*`, `OIDC_ENABLED` | Keycloak client |
| `DOCUMENT_*`, `PD_HOST_*` | документы / 152‑ФЗ disclosure |
| `OUTBOX_*`, `CRON_SECRET` | lead outbox worker |
| `SITES_ADMIN_ELEVATE` | **только** Sites demo; off на VPS |

См. `.env.example`, [INTEGRATIONS.md](./INTEGRATIONS.md).

### 3.2 voronka

| Переменная | Назначение |
|------------|------------|
| `API_PORT`, `DATABASE_URL`, `REDIS_URL` | runtime |
| `CRM_PUBLIC_URL`, `VORONKA_PUBLIC_URL` | chrome / ResultURL base |
| `ROBOKASSA_*`, `ROBOKASSA_LIVE_READY` | платежи (live off до фискализации) |
| `YOOKASSA_*`, `YOOKASSA_ENABLED` | UI skeleton; adapter TBD |
| `MAILU_WEBMAIL_URL`, `SMTP_*` | почта status + email campaigns |
| `INTEGRATION_INBOUND_TOKEN` | inbound leads / Bearer |
| `SOLO_PR_EVENTS_URL`, `SOLO_PR_WEBHOOK_SECRET` | outbound access events |
| `LMS_END_ENROLLMENT_URL`, `LMS_END_WEBHOOK_SECRET`, `LMS_M2M_TOKEN` | enrollment |
| `TG_*` / `MAX_*` / `VK_*` | bot connection env **names** |
| `RAG_*`, `OPENROUTER_*`, `OLLAMA_*` | AI draft-only |
| `OUTREACH_MAX_ENABLED` | live unofficial transport gate |

### 3.3 lms_end adapter

| Переменная | Назначение |
|------------|------------|
| `ACCESS_AUTHORITY=external` | **обязательный** prod-режим без своей кассы |
| `VORONKA_LMS_TOKEN`, `VORONKA_LMS_HMAC_SECRET` | inbound enrollment |
| `VORONKA_COMPLETION_URL` | outbound `learning.completed` |
| `MEETINGS_API_TOKEN`, `BBB_MEDIA_PLANE_HOST` | meetings M2M; media host TBD |
| `LMS_ADAPTER_DB_PASSWORD`, `LMS_API_PORT` | learning DB / publish port |
| `OPENOLAT_*`, `KEYCLOAK_*`, `OIDC_*`, `LEARN_DOMAIN`, `AUTH_DOMAIN` | LMS stack |

### 3.4 lms_end portal

| Переменная | Назначение |
|------------|------------|
| `PORTAL_HOST`, `PORTAL_SESSION_SECRET` | host + HMAC sessions |
| `LMS_END_URL`, `LMS_END_TOKEN` / `MEETINGS_API_TOKEN` | delegate meetings to adapter |
| `STUB_*_EMAIL/PASSWORD` | stub login до Keycloak |
| `BBB_JOIN_STUB`, `BBB_MEDIA_PLANE_HOST` | stubs; media never current VPS |

### 3.5 Mailu (ops, не в git solo_pr)

| Концепт | Назначение |
|---------|------------|
| Domain `vodopetov.ru` | текущий mail SoR |
| Front → nginx LE | `mail.vodopetov.ru` → `:8080` |
| SMTP credentials | в CRM `SMTP_*` / Mailu users — не в браузерном UI |

---

## 4. HTTP surface map (integration-facing)

### solo_pr

| Method | Path | Роль |
|--------|------|------|
| `POST` | `/api/integrations/voronka` | inbound access events |
| `POST` | `/api/integrations/lms/handoff` | redeem launch ticket |
| `GET\|POST` | `/api/cron/outbox` | lead retry |
| `GET` | `/api/ready`, `/api/health` | probe |
| Portal | `/api/portal/*` | session, LMS launch, CMS media |

### voronka

| Method | Path | Роль |
|--------|------|------|
| `POST` | `/api/crm/integrations/solo_pr/leads` | `lead.created` |
| `POST` | `/api/crm/integrations/commerce/quote` | checkout quote |
| `GET\|POST` | `/api/crm/robokassa/result` | ResultURL |
| `POST` | `/api/crm/integrations/lms_end/completions` | learning complete |
| `POST` | `/api/crm/yookassa/webhook` | **501** stub |
| UI | `/crm/`, `/ops/`, `/hooks/{cid}`, Mini App `/` | portals |

### lms_end

| Method | Path | Роль |
|--------|------|------|
| `POST` | `/api/integrations/voronka/enrollment` | grant/revoke |
| `GET` | `/api/m2m/enrollment` | status for solo_pr BFF |
| `*` | `/api/meetings/*` | meeting stubs (Bearer) |
| Portal | `:3040` `/api/meetings/*`, `/staff/*`, `/learner` | staff/learner UI |

---

## 5. Reverse proxy (целевой host → upstream)

| Host | Upstream | Примечание |
|------|----------|------------|
| `solo-pr.ru` | solo_pr `:3010` | learner |
| `cms.solo-pr.ru` | solo_pr `:3010` | host → `/admin` |
| `crm.solo-pr.ru` | voronka `:18080` | `/` → `/crm/` |
| `voronka.solo-pr.ru` | voronka `:18080` | `/ops/`, Mini App, hooks |
| `lms.solo-pr.ru` | stub → portal `:3040` / OpenOlat `:18082` | adapter API path separate |
| `mail.vodopetov.ru` | Mailu `:8080` | webmail/admin |
| `auth.solo-pr.ru` | Keycloak `:18081` | когда поднят |

Примеры nginx: соседние репо `deploy/nginx-*.solo-pr.ru.conf`; Caddy solo_pr — `deploy/Caddyfile`.

---

## 6. Observability & ops gates

| Контур | Health | Critical gates |
|--------|--------|----------------|
| solo_pr | `/api/ready` | SQLite readable; outbox not stuck |
| voronka | `/health` | worker heartbeat; Outbox oldest; disk; `ROBOKASSA_LIVE_READY` |
| lms portal | `/api/health` | honest empty-state if LMS off |
| lms adapter | `/health` | enrollment reconcile; OpenOlat reachability |
| Mailu | webmail 302/200 | cert, MX/SPF/DKIM |

Backup: solo_pr volume + voronka Postgres/media offsite; LMS DB when live. Restore drill — до live денег.

---

## 7. Local / CI reference ports

| App | Dev default |
|-----|-------------|
| solo_pr `npm run dev` | `:3000` |
| voronka API | `:18080` |
| lms_end portal | `:3040` |
| lms_end adapter (alone) | `:18080` — использовать только в изоляции от voronka |

Документы порталов: [PORTALS.md](./PORTALS.md).
