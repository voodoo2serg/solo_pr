# Контракты интеграций solo_pr ↔ voronka / lms_end

Секреты только в env / secret store. В этом документе секретов нет.

## Env

| Переменная | Назначение |
|------------|------------|
| `VORONKA_WEBHOOK_URL` | Outbound `lead.created` |
| `VORONKA_WEBHOOK_SECRET` | HMAC для outbound (и inbound, если inbound secret не задан) |
| `VORONKA_INBOUND_SECRET` | HMAC для inbound `deal.paid` / `access.*` |
| `VORONKA_BASE_URL` | Read BFF / ping / AI deep link |
| `VORONKA_ENABLED` | Override enable |
| `LMS_BASE_URL` | Enrollment status + privacy notify |
| `LMS_API_SECRET` | HMAC к lms_end |
| `LMS_ENABLED` | Override enable |
| `OIDC_ISSUER` | Keycloak realm issuer |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | OIDC client |
| `OIDC_ENABLED` | Override enable |
| `DOCUMENT_URL_ALLOWLIST` | CSV hostnames для внешних документов |
| `DOCUMENT_SIGNING_SECRET` | Подпись download token |
| `PD_HOST_COUNTRY` / `PD_HOST_PROVIDER` / `PD_HOST_REGION` | Юрисдикция ПДн в админке/legal |
| `SITES_ADMIN_ELEVATE` | Только Sites demo; default off |

## Подпись

```
signature = HMAC-SHA256(secret, "{timestamp}.{body}")
outbound headers: x-solo-timestamp / x-solo-signature: sha256=<hex>
                 + x-voronka-timestamp / x-voronka-signature (aliases, same values)
inbound accepts:  x-voronka-* OR x-solo-* (case-insensitive)
```

Body для подписи — **канонический JSON** (отсортированные ключи) при исходящих событиях; для inbound voronka допускается сырое тело запроса, как прислано.

Skew: ±5 минут.

## SPO-1 Outbound: `lead.created`

`POST {VORONKA_WEBHOOK_URL}`

```json
{
  "type": "lead.created",
  "kind": "lead.created",
  "idempotency_key": "<lead.id>",
  "event_id": "<lead.id>",
  "source": "solo_pr",
  "data": {
    "id": "...",
    "contact_type": "email|telegram|max",
    "contact": "...",
    "email": "...",
    "name": "...",
    "kind": "business|club|course",
    "service": "...",
    "message": "...",
    "consent": "...",
    "ads_consent": false,
    "created": "ISO-8601",
    "source": "solo_pr"
  }
}
```

Dual-emit: `type`+`kind`, `idempotency_key`+`event_id` (identical values). Идемпотентность: lead id. Локальный лид не удаляется при ошибке; outbox retry → `dead` после 8 попыток. В админке «Обращения» видно `sync_status`: pending/ok/error.

## SPO-2 Inbound: доступы

`POST /api/integrations/voronka`

```json
{
  "event_id": "unique-event-id",
  "idempotency_key": "unique-event-id",
  "type": "deal.paid|access.granted|access.revoked",
  "kind": "deal.paid|access.granted|access.revoked",
  "email": "user@example.com",
  "external_id": "optional-crm-id",
  "course_id": "cms-course-id",
  "club": true,
  "name": "optional"
}
```

Dual-read: `type` **или** `kind`; `event_id` **или** `idempotency_key`; flat fields **или** nested `data`; `course_id` **или** `commerce_product_id`. Headers: `x-voronka-*` **или** `x-solo-*`.

- Идемпотентность по нормализованному `event_id` (`integration_events`).
- Audit actor=`voronka`.
- Ручной override админа: `purchases.source=manual`, `users.club_source=manual` — voronka не затирает manual без необходимости.
- Checkout UI сайта (если появится) должен звать только API voronka; локальная БД не ledger.

## SPO-3 LMS

CMS course fields: `lmsCourseId`, `lmsLaunchUrl`.

- Status: `GET {LMS_BASE_URL}/api/m2m/enrollment?email=&course_id=` (signed).
- Launch: `POST /api/portal/lms/launch` → one-time ticket (requires local `purchases`/admin grant).
- Redeem: `POST /api/integrations/lms/handoff` with LMS HMAC and JSON `{ "ticket": "..." }` → user/course claims; ticket single-use.
- Revoke отражается при redeem и при чтении статуса ЛК.

## Outbox / retries

- In-process worker: `OUTBOX_POLL_MS` (default 15s), started with integrations module.
- External cron: `GET|POST /api/cron/outbox` with `Authorization: Bearer $CRON_SECRET` (or loopback without secret).
- Admin flush still available; retries do **not** depend on new leads.

## SPO-4 OIDC

IdP: **Keycloak**.  
`GET /api/portal/auth/oidc/start` → authorize URL; callback `GET /api/portal/auth/oidc/callback`.  
`oidc_sub` — стабильный ключ; email — soft key с ошибкой при конфликте merge.

## Privacy events

`subject.delete` / `subject.export` могут уведомлять voronka webhook и `LMS /api/m2m/privacy` при включённых интеграциях.
