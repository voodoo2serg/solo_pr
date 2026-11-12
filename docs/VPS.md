# Развёртывание Соло-PR на VPS (production ПДн)

**Production персональные данные — только российский VPS / официальное облако РФ (152‑ФЗ).**  
Cloudflare Sites / Workers / D1 в этом репозитории — **non-PII demo**, не production-путь. См. [ARCHITECTURE.md](./ARCHITECTURE.md).

Инструкция рассчитана на Linux-сервер у RU-провайдера (Yandex Cloud / VK Cloud / Selectel / Timeweb — выбор владельца) с Git, Docker Engine и Docker Compose v2. Node.js на хосте для контейнерного запуска не нужен: используется образ Node.js 24.

## Checklist перед продакшеном

- [ ] DNS A/AAAA на IP VM в выбранном регионе РФ
- [ ] HTTPS (Caddy/nginx) на 80/443; приложение только на `127.0.0.1:3000`
- [ ] `COOKIE_SECURE=true`, `SITE_ORIGIN=https://ваш-домен`
- [ ] `DATA_DIR` на volume с правами `0700`, бэкап вне сервера
- [ ] Readiness: `GET /api/ready` (Compose healthcheck уже настроен)
- [ ] Firewall: снаружи только 80/443; SSH ограничен
- [ ] Заполнены `PD_HOST_PROVIDER` / `PD_HOST_REGION` и сверены legal-тексты
- [ ] Секреты интеграций (`VORONKA_*`, `LMS_*`, `OIDC_*`) только в env/secret store

## 1. Подготовьте домен и каталог

Направьте DNS домена на IP сервера. Разрешите входящие подключения на 80 и 443 для HTTPS-прокси. Порт приложения 3000 наружу открывать не нужно.

```bash
git clone https://github.com/voodoo2serg/solo_pr.git
cd solo_pr
docker compose up -d --build
docker compose logs --tail=100 community
```

Первый запуск создаёт именованный том `community-data`. В нём сохраняются:

- `community.sqlite` — аккаунты, сеансы, заявки, покупки, документы, настройки и доступы;
- `content.json` — тексты и структура редактируемого наполнения.

Том сохраняется при пересборке контейнера. Не используйте `docker compose down -v`: эта команда удаляет данные.

## 2. Настройте HTTPS

Установите Caddy из официального пакета для вашей ОС. Пример конфигурации находится в `deploy/Caddyfile`. Скопируйте его в `/etc/caddy/Caddyfile`, заменив `{$SITE_DOMAIN}` на свой домен, например `solo-pr.ru`:

```caddyfile
solo-pr.ru {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Проверьте конфигурацию и перечитайте её:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy получает и обновляет сертификаты автоматически при корректном DNS и доступных портах 80/443. Другой HTTPS-прокси допустим, если передаёт исходный Host и направляет запросы к loopback-порту приложения.

В production `COOKIE_SECURE=true`: вход и сохранение сеанса рассчитаны на HTTPS. Для теста по HTTP на сервере не отключайте этот флаг ради внешнего доступа.

Откройте главную по HTTPS. Проверьте футер, правовые страницы и формы.

## 3. Создайте администраторов

После первого обращения к сайту база уже создана. Для трёх bootstrap-операторов (пароли и роли — в [admin-instruction.md](./admin-instruction.md)):

```bash
docker compose exec community npm run seed:admins
```

Либо одного администратора интерактивно:

```bash
docker compose exec community node scripts/admin.mjs
```

Введите email и уникальный пароль длиной 12–128 символов. Ввод пароля скрыт. Если указанный email уже есть в базе, команда назначит ему административную роль и установит введённый пароль. Интерактивный пароль не указывайте в аргументах shell.

Затем войдите в `https://ваш-домен/login` и откройте `/admin`.

Сброс пароля с завершением старых сеансов:

```bash
docker compose exec community node scripts/admin.mjs reset-password
```

## 4. Проверьте содержимое

В редакторе доступны:

- главная и тексты разделов;
- курсы: название, изображение, описание, дата, статус и темы;
- статьи и клубные материалы;
- видео с HTTPS-ссылками;
- события с датами и ссылками видеосвязи;
- контакты и правовая информация;
- участники, клубный доступ, подтверждённые покупки и индивидуальные документы;
- гостевые заявки с выбранной услугой и способом связи: email, Telegram или MAX.

Доступ к курсу открывается администратором после подтверждения покупки. Самостоятельной оплаты на сайте пока нет. Для конфиденциальных документов используйте индивидуальные защищённые ссылки.

Начальные темы курсов помечены как планируемые без выдуманных дат. Уточните даты и условия до объявления набора. Проверьте описание оператора, обработки данных, хостинга и внешних сервисов. Необходимые cookie используются для сеанса и настроек; аналитический счётчик не подключён.

## 5. Резервное копирование

Для согласованной копии SQLite и JSON остановите приложение на время архивации:

```bash
mkdir -p backups
chmod 700 backups
docker compose stop community
docker compose run --rm --no-deps -T community tar -C /app/data -czf - . > backups/community-data.tgz
chmod 600 backups/community-data.tgz
docker compose start community
```

В случае ошибки архивации всё равно запустите приложение. Копия содержит персональные данные: храните её с ограниченным доступом, дополнительно копируйте вне сервера и проверяйте восстановление. Каталог `backups/` исключён из Git.

Для восстановления остановите приложение и сначала сохраните текущие данные. Затем замените содержимое тома из проверенной копии:

```bash
docker compose stop community
docker compose run --rm --no-deps -T community tar -C /app/data -xzf - < backups/community-data.tgz
docker compose start community
```

Восстановление поверх непустого тома заменяет совпадающие файлы. Для точного восстановления используйте пустой подготовленный том и сохраняйте владельца файлов `node`.

## 6. Обновление кода

Сначала сделайте резервную копию, затем:

```bash
git pull --ff-only
docker compose up -d --build
docker compose logs --tail=100 community
```

Проверьте вход, открытые и закрытые материалы, форму обращения и сохранение редакторских изменений.

## Запуск без Docker

Нужен Node.js 24 с поддержкой `node:sqlite`.

```bash
npm ci --legacy-peer-deps
npm run build:vps
```

Запускайте `npm start` через systemd или другой менеджер процессов от отдельного непривилегированного пользователя. Задайте постоянный `DATA_DIR`, `NODE_ENV=production`, `COOKIE_SECURE=true`. HTTPS-прокси должен быть настроен так же, как выше. При запуске без контейнера ограничьте доступ к порту 3000 брандмауэром.

## Логи и метрики

- Health: `GET /api/health` (или `/api`) — `ok`, версия, SQLite readable.
- Readiness: `GET /api/ready`.
- Приложение пишет JSON-логи в stdout (Docker/`journald`). Направьте их в сборщик **в том же RU-регионе** (например, managed logging провайдера VPS). Не отправляйте ПДн-логи на иностранные SaaS без отдельной оценки 152‑ФЗ.
- Счётчики: 5xx, auth failures, lead sync failures (см. поле `metrics` в health).

## Документы ЛК

Файлы по умолчанию хранятся в `$DATA_DIR/documents` на том же RU volume (object key в БД). Внешние HTTPS URL — только при `DOCUMENT_URL_ALLOWLIST`. Скачивание: `/api/documents/:id` с `Cache-Control: private`.

## Отличие от Sites

Для production используйте `npm run build:vps`, а не `npm run build`. Последняя команда создаёт Worker/D1-сборку **только для non-PII demo**. Хранилище VPS не использует Cloudflare D1. `SITES_ADMIN_ELEVATE` на VPS отсутствует и должен оставаться выключенным в Sites. Перенос пользователей из Sites не поддерживается.
