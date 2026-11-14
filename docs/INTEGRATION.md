# Принципы интеграции платформы

**Роль документа:** каноническая «библия» границ между `solo_pr`, `voronka`, `lms_end`, Mailu и staff-порталами.  
**Репозитории не сливаются. Shared DB запрещена.** Связь — только signed HTTPS / M2M.  
**Деплой VPS в этом документе не выполняется** — только контракты и топология.

Смежные файлы в этом репо: [ARCHITECTURE.md](./ARCHITECTURE.md) · [INTEGRATIONS.md](./INTEGRATIONS.md) (wire details) · [PORTALS.md](./PORTALS.md) · [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md).

Портальные фазы 1–4 (код в main соседей): CMS → CRM → Voronka ops → LMS portal stubs.

---

## 1. Топология продуктов

```text
                    ┌─────────────────────────────────────────────┐
   RU cloud / VPS   │  solo_pr                                     │
   (152‑ФЗ surface) │  solo-pr.ru     публичный сайт + ЛК ученика  │
                    │  cms.solo-pr.ru  CMS / staff roles matrix    │
                    │  BFF, outbox лидов, handoff LMS tickets      │
                    └───────────────┬─────────────────────────────┘
                                    │ signed HTTPS (wire v1)
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ voronka (home)  │     │ Mailu (mail SoR)    │     │ lms_end (home)       │
│ crm.solo-pr.ru  │     │ mail.vodopetov.ru   │     │ lms.solo-pr.ru       │
│   CRM / деньги  │     │ webmail + SMTP/IMAP │     │ portal + adapter     │
│ voronka.solo-pr │     │ (не второй CRM)     │     │ OpenOlat + Keycloak  │
│   ops / боты    │     └─────────────────────┘     │ (стек — отдельно)    │
└─────────────────┘                                 └──────────────────────┘
```

| Поверхность | Хост | Backend | Назначение |
|-------------|------|---------|------------|
| Публичный сайт + «Войти» | `solo-pr.ru` | solo_pr | Только learner / участник |
| CMS | `cms.solo-pr.ru` | solo_pr `/admin` | Контент, медиа, роли staff, интеграции |
| CRM | `crm.solo-pr.ru` | voronka `/crm/` | Клиенты, сделки, ledger, платежи, email-кампании |
| Voronka ops | `voronka.solo-pr.ru` | voronka `/ops/` + Mini App | Боты, сценарии, мессенджер-рассылки, support, AI |
| LMS | `lms.solo-pr.ru` | lms_end `portal/` → OpenOlat | Учебная среда, meetings stubs, enrollments |
| Почта | `mail.vodopetov.ru` | Mailu | Ящики / SMTP; CRM не заменяет webmail |
| Auth (цель) | `auth.solo-pr.ru` | Keycloak | Единый IdP staff + learners |

**Инвариант UX:** публичное «Войти» **не** ведёт в CMS / CRM / Voronka. Staff — отдельные хосты + stub login (до SSO).

---

## 2. Source of truth (SoR)

| Домен | SoR | Копия / проекция |
|-------|-----|------------------|
| Контент сайта, согласия 152‑ФЗ, аватары/документы ЛК | **solo_pr** (SQLite + volume) | — |
| Staff-матрица зон `lms\|cms\|crm\|voronka` | **solo_pr** `staff_roles` | CRM checklist `GET /staff/cms-matrix` (ручная v1) |
| Лид после отправки | **voronka** Contact/Profile | solo_pr `leads` + outbox до ack |
| Деньги: Order / Payment / Invoice | **voronka** | solo_pr `purchases` = статус ЛК (`manual\|voronka`), **не** ledger |
| AccessGrant authority | **voronka** | lms_end enrollment projection; solo_pr club/course flags |
| Боты, Outbox, mediabank, funnel graph | **voronka** | — |
| Почтовые ящики / SMTP/IMAP | **Mailu** | CRM видит status + webmail link; campaigns через SMTP env |
| Курсы, оценки, membership OpenOlat | **OpenOlat** | lms_end adapter projection |
| Учебная сессия / attendance academic | **lms_end** (+ будущий BBB media plane) | CRM — RO analytics |
| Идентичность SSO | **Keycloak** (цель) | Сегодня острова: cookie solo_pr / CRM scrypt / portal HMAC |

### Запреты

- Shared Postgres / SQLite между репо.
- Checkout / Robokassa authority в LMS (`ACCESS_AUTHORITY=external`).
- Второй CRM (Twenty server, Espo, Chatwoot).
- Cloudflare Workers/D1 как production-путь ПДн solo_pr.
- Автоответ ИИ клиенту без явного approve менеджера.
- Вторая матрица прав **ученика** в CMS (это OpenOlat).
- BBB media plane на текущем VPS `213.171.9.30` (только план UI/API).

---

## 3. Signed webhooks / wire v1

Каноника полей и dual-read: [INTEGRATIONS.md](./INTEGRATIONS.md). Кратко:

| Поток | Направление | Auth |
|-------|-------------|------|
| `lead.created` | solo_pr → voronka | HMAC `X-Solo-*` + alias `X-Voronka-*` (или Bearer) |
| `deal.paid` / `access.granted\|revoked` | voronka → solo_pr | HMAC `X-Voronka-*` / `X-Solo-*` |
| `enrollment.desired\|revoked` | voronka → lms_end | Bearer `VORONKA_LMS_TOKEN` и/или HMAC |
| `learning.completed` | lms_end → voronka | `X-Lms-*` / `X-Voronka-*` / Bearer |
| Meetings M2M | portal ↔ adapter / voronka | Bearer `MEETINGS_API_TOKEN` |
| Privacy `subject.*` | solo_pr → neighbors | при включённых интеграциях |

**Правила подписи**

- Base string: `{timestamp}.{raw_body}` → HMAC-SHA256 hex, skew ≤ 300s.
- Emitters dual-emit: `type`+`kind`, `event_id`+`idempotency_key` (одинаковые значения).
- Receivers dual-read: оба имени + flat **или** nested `data`.
- Секреты только в env / secret store; UI показывает «настроено?» без значений.

---

## 4. Auth zones

| Зона | Cookie / credential | Scope |
|------|---------------------|-------|
| Learner (apex) | `solo_session` host-only | `/account`, материалы, launch LMS |
| CMS staff | тот же solo_pr session + `staff_roles` | `cms.*` → `/admin` |
| CRM / Voronka ops | `crm_session` host-only | `/crm/`, `/ops/`; managers 403 на ops mutations |
| LMS portal | HMAC-signed portal cookie | `lms.*` stub staff/learner |
| Mailu | собственные сессии Mailu | webmail / admin |
| Keycloak (план) | OIDC | единый IdP; staff groups ↔ CMS matrix |

До SSO: stub login **per zone** — не «одна кнопка на всё». Cookie `Domain=.solo-pr.ru` **не** шарить между learner и staff без осознанной SSO-схемы. Кросс-ссылки в chrome видны только если зона разрешена матрицей.

---

## 5. BBB (план поверхности — без инсталла)

| Слой | Владелец | Делает | Не делает |
|------|----------|--------|-----------|
| Анонс / календарь / deep-link | solo_pr CMS + ЛК | Дата, описание, кнопка «в комнату» | Не хостит медиа |
| Сессия, join URL, Q&A, attendance, sparks | lms_end adapter + portal | SoR учебной сессии; stubs `/api/meetings/*` | Не ledger денег |
| Reminder DM | voronka Outbox / template `meeting_reminder` | Уведомление Identity | Не запускает BBB |
| RO «видел вебинар» | CRM analytics / drawer | Потребитель signed events | Не журнал оценок |
| Media plane (WebRTC/SFU) | **отдельный host** когда будет решение | Видео/чат | **Не** на текущем VPS |

События (имена контракта): `meeting.scheduled`, `attendance.recorded`, `feedback.spark`. Код stubs: `lms_end/portal` + adapter; CRM пустые RO-блоки до реальных событий.

---

## 6. Twenty CRM — только композиция

| Решение | Статус |
|---------|--------|
| Поднять Twenty как продукт / второй SoR | **Нет** |
| Копировать twenty-ui целиком | Не обязательно |
| Композиция UI: sidebar · таблица · board сделок · drawer | **Да** — voronka Workspace |
| Sync Twenty API / сервер Twenty | Вне scope |

Деньги и AccessGrant остаются в voronka. UI усиливается «как Twenty», без второго CRM.

---

## 7. Mailu в композиции

| Роль | Кто |
|------|-----|
| Ящики, DKIM, webmail/admin | Mailu (`mail.vodopetov.ru`) |
| Email campaigns / аудитория / статус SMTP | CRM (`crm.*`) |
| Мессенджер blasts / кружки | Voronka ops (`voronka.*`) |

Домен ящиков сегодня: **vodopetov.ru**. `solo-pr.ru` как Mailu-домен — отдельный ops-шаг, не блокер UI.

---

## 8. Денежный путь (цель)

```text
solo_pr checkout UI (опц.) → voronka commerce API → Robokassa/YooKassa ResultURL
  → Payment (SoR) → entitlement outbox → AccessGrant
  → events → solo_pr ЛК (purchases) + lms_end enrollment
```

- Live Robokassa только при `ROBOKASSA_LIVE_READY=1` **и** закрытой фискализации.
- YooKassa: UI skeleton; webhook **501** до адаптера.
- LMS checkout в external mode — **410 / запрещён**.

---

## 9. Что уже согласовано кодом (после portal phases)

| Контур | В main | Ещё не на VPS / не live |
|--------|--------|-------------------------|
| CMS hosts, roles, footer, learner IA | solo_pr | полный cutover staff с apex |
| CRM Twenty-like + payments/mail/analytics | voronka | YooKassa adapter; CSV export |
| Ops portal боты/сценарии/AI draft | voronka | AI auto-send (запрещён); live outreach flags |
| LMS portal + meeting stubs | lms_end | OpenOlat/Keycloak compose up; BBB media |
| Wire lead/access/enrollment/completion | все три | prod LMS_* / OIDC env |

**Этот этап (5):** только документация в solo_pr. **Этап 6:** code audit. **Деплой / BBB install — отдельный проход.**
