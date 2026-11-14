# Порталы solo-pr.ru (CMS phase)

| Хост | Назначение | Приложение |
|------|------------|------------|
| `https://solo-pr.ru` | Публичный сайт + «Войти» → ЛК **ученика** | solo_pr |
| `https://cms.solo-pr.ru` | CMS `/admin`, матрица staff-ролей | solo_pr (тот же контейнер) |
| `https://crm.solo-pr.ru` | CRM / платежи | voronka `/crm/` |
| `https://voronka.solo-pr.ru` | Боты / сценарии | voronka |
| `https://lms.solo-pr.ru` | OpenOlat + adapter (stub until LMS up) | lms_end / OpenOlat |

## Инварианты

1. Публичное «Войти» **не** ведёт в CMS/CRM/Voronka.
2. Cookie `solo_session` — **host-only** (без `Domain=.solo-pr.ru`) до SSO.
3. Browser POST Origin: разрешены apex и staff-поддомены (`src/lib/portals.ts`).
4. Матрица зон `lms|cms|crm|voronka` хранится в SQLite `staff_roles` (вкладка «Администраторы и роли»).

## Локально

Без спец-хоста (`localhost`) доступны и ЛК, и `/admin`. Для проверки CMS-хоста: `/etc/hosts` → `127.0.0.1 cms.solo-pr.ru` и открыть `http://cms.solo-pr.ru:3000` (middleware отправит `/` → `/admin`).
