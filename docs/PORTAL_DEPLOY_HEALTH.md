# Отчёт о деплое порталов (health)

**Дата:** 2026-11-14T07:56Z  
**Хост:** `spb-3-vm-zzu0` · `213.171.9.30` (Tailscale SSH timeout — деплой через public IP)  
**BBB:** не устанавливался  
**Rollback:** `/root/vps-rollback-2026-11-14-portal-deploy-20261114T074644Z`

---

## Сводка

| Секция | Результат | Доказательство |
|--------|-----------|----------------|
| Public `solo-pr.ru` / www | **PASS** | HTTPS 200, `/login` 200, `/api/ready` `{"ready":true}` |
| CMS `cms.solo-pr.ru` | **PASS** | `/` → 302 `/admin`, `/admin` 200, host-only cookie path |
| CRM `crm.solo-pr.ru` | **PASS** | `/` → 302 `/crm/`, `/crm/` 200 |
| Voronka ops | **PASS** | `/health` 200, `/ops/` 200, `/hooks/{cid}` reachable (404 unknown cid = route live) |
| LMS portal | **PARTIAL** | Portal UI live on `:3040`; OpenOlat/adapter **не** развёрнуты; BBB нет |
| Cross-wire solo_pr ↔ voronka | **PASS** | `VORONKA_BASE_URL=https://voronka.solo-pr.ru`; container fetch `/health` 200 |
| Preserve Mailu/RAGA/Wi-TED/site_sv | **PASS** | Containers up; HTTPS 200 on vodopetov / mail / raga / wi-ted |

**Общий вердикт:** портальный стек на VPS обновлён и отвечает по HTTPS. LMS — портал из `lms_end#4` (stub mode), без OpenOlat и без BBB.

---

## Что задеплоено

| Сервис | Путь на VPS | Git SHA (main) | Image ID (short) | Upstream |
|--------|-------------|----------------|------------------|----------|
| solo_pr | `/opt/solo_pr` | `c48a443` | `f8111367dcf5` | `127.0.0.1:3010` |
| voronka | `/opt/voronka` | `52d8185` | `bb167767354b` | `127.0.0.1:18080` |
| LMS portal | `/opt/lms_end/portal` | `52e02e0` | `7f03eb739ead` | `127.0.0.1:3040` |

### solo_pr
- Pull `ca4f17f` → `c48a443` (phases 1/5/6).
- Volume `solo_pr_community-data` **сохранён** (без `down -v`).
- Порт хоста остаётся **3010** (site_sv на 3000).
- `VORONKA_*` URL мигрированы sslip → `https://voronka.solo-pr.ru` (секреты **unchanged**).
- sslip `voronka.213.171.9.30.sslip.io` оставлен живым для отката.

### voronka
- Pull `a2de2eb` → `52d8185` (CRM #7 + ops #8).
- DB/redis volumes **сохранены**; migrate прошёл; api/worker пересобраны с CRM+ops static.
- Локальный `extra_hosts` для `api.telegram.org` сохранён.
- nginx vhosts `crm`/`voronka` уже совпадали с `deploy/nginx-*.solo-pr.ru.conf` (+ LE от certbot) — без структурной смены.

### LMS
- Stub HTML `/var/www/lms-stub` заменён nginx-прокси на portal `:3040`.
- Compose: `/opt/lms_end/portal/compose.yaml` (сервис `portal-portal-1`).
- Stub login: email `lms@solo-pr.ru` (staff) — пароль только на VPS `/opt/lms_end/portal/.stub-creds` (не в чате).
- `GET /api/health`: `bbb_installed=false`, `adapter.configured=false` (честный stub).
- **Gaps:** OpenOlat + Keycloak + `compose.lms` adapter; полный enrollment SoR; BBB media plane (внешний, не этот VPS).

---

## Smoke-тесты (HTTPS)

Проверено снаружи (curl + openssl) и с VPS.

| URL | HTTP | Примечание |
|-----|------|------------|
| https://solo-pr.ru/ | 200 | публичный сайт |
| https://www.solo-pr.ru/ | 200 | |
| https://solo-pr.ru/login | 200 | learner; без ссылки `/admin` в разметке |
| https://solo-pr.ru/api/ready | 200 | `ready:true` |
| https://cms.solo-pr.ru/ | 302 → `/admin` | host separation |
| https://cms.solo-pr.ru/admin | 200 | CMS UI |
| https://crm.solo-pr.ru/ | 302 → `/crm/` | |
| https://crm.solo-pr.ru/crm/ | 200 | CRM UI |
| https://voronka.solo-pr.ru/health | 200 | `status:ok` |
| https://voronka.solo-pr.ru/ops/ | 200 | ops UI |
| https://voronka.solo-pr.ru/hooks/probe | 404 | маршрут `/hooks/{cid}` жив |
| https://voronka.213.171.9.30.sslip.io/health | 200 | rollback path |
| https://lms.solo-pr.ru/ | 200 | portal |
| https://lms.solo-pr.ru/login | 200 | |
| https://lms.solo-pr.ru/api/health | 200 | stub mode |
| https://lms.solo-pr.ru/staff | 307 → `/login` | auth gate |
| LMS `POST /api/auth/login` (VPS) | 200 | role `staff` |
| https://vodopetov.ru/ | 200 | preserved |
| https://mail.vodopetov.ru/webmail/ | 200 | preserved |
| https://raga.vodopetov.ru/ | 200 | preserved |
| https://wi-ted.vodopetov.ru/ | 200 | preserved |

LE: SAN `cms.solo-pr.ru` (+ crm/voronka/lms) valid → 2027-02-12.

---

## Безопасность / откат

- Снимок nginx + notes: `/root/vps-rollback-2026-11-14-portal-deploy-20261114T074644Z`
- Предыдущий portal nginx: `/root/vps-rollback-2026-11-14-portal-nginx/`
- **Не** выполнялось: `docker compose down -v`, BBB install, wipe DB.
- Mailu / RAGA / Wi-TED / site_sv не трогались (кроме косвенной нагрузки диска ~1 G).

---

## Blockers / next

1. OpenOlat + adapter (`lms_end` compose.lms) — отдельный проход; не путать порт `:18080` с voronka.
2. Keycloak / единый SSO (`auth.solo-pr.ru`) — ещё нет.
3. BBB — только внешний media plane; **не** на этот VPS.
4. Ротация stub/bootstrap паролей после первых логинов.
5. Tailscale на VPS по-прежнему не в сети агента (SSH по public IP).
