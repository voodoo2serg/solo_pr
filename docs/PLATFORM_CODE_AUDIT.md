# Platform code audit (after portal phases 1–5)

**Role:** post-portal quality / gaps / risks across `solo_pr` · `voronka` · `lms_end`.  
**Mode:** analysis only — no deploy, no BBB install.  
**Date:** 2026-11-14  
**SHAs (main at audit):** solo_pr `b6c1d8f` (phase 5 docs merged [#5](https://github.com/voodoo2serg/solo_pr/pull/5)) · voronka `52d8185` · lms_end `52e02e0`  
**Integration bible (phase 5):** [INTEGRATION.md](./INTEGRATION.md) · [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)  
**Portals:** [PORTALS.md](./PORTALS.md) · wire: [INTEGRATIONS.md](./INTEGRATIONS.md)

---

## Executive verdict

Portal phases **closed the UX/host gap** that the Nov-12 architecture audit flagged (one login → CMS/sales blur). Wire contracts and SoR language are now **documented and mostly coded**. The platform is still **not** a live autonomous commercial+learning center: LMS stack and OIDC are off on VPS, live money gated, YooKassa stub, BBB media absent, and `lms_end` still carries frozen CRM/site trees.

**One line:** boundaries and portals are real in code; production cutover and money/LMS depth remain the risk surface.

| Contour | Fit after portals | Top residual risk |
|---------|-------------------|-------------------|
| **solo_pr** | Strong as RU hub + CMS host | LMS_* / OIDC unset; `purchases` still not ledger-truth |
| **voronka** | Strong as commerce + ops | Fiscalization + live gate; single worker; YooKassa 501 |
| **lms_end** | Portal stubs good; stack not live | Vendored monorepo debt; port clash; OpenOlat down |

---

## solo_pr

### Quality

- Clear VPS runtime path: Next + SQLite store; Prisma/`db:push` scripts **refuse** with exit 1 (`package.json`); Sites/Worker marked non-PII.
- Portal phase 1 shipped host routing (`src/proxy.ts`, `src/lib/portals.ts`), `staff_roles` SoR (`src/lib/server/staff-roles.ts`), learner IA, footer/media/publish UX.
- Integration surface documented and tested: `tests/integrations.contract.mjs`, `tests/portal.integration.mjs`; CI runs typecheck + CMS + VPS build + contracts.
- Cookie/session: host-only `solo_session`; Origin allowlist for portal hosts.

### Gaps

- Production `LMS_*` / `OIDC_*` still typically unset → ЛК launch empty-states dominate.
- Staff matrix sync to CRM/Keycloak is checklist-only (manual v1).
- `@prisma/client` remains in dependencies though unused by portal runtime — hygiene debt.
- Apex `/admin` still reachable; cms.* is preferred, not exclusive.
- Checkout UI → voronka commerce API still optional/future.

### Risks

- Operators may treat CMS `purchases` as money SoR (false ledger).
- Enabling Sites/`SITES_ADMIN_ELEVATE` on RU VPS would break 152‑ФЗ posture.
- Without outbox cron/`CRON_SECRET`, lead delivery depends on in-process worker alone.

### Verdict

solo_pr is now a credible **integration hub + CMS portal** in code; readiness is blocked by **env cutover** (LMS/OIDC) and remaining hygiene (Prisma dep), not by missing portal IA.

---

## voronka

### Quality

- Commerce path solid: Payment SoR, Robokassa signature/test≠live, `ROBOKASSA_LIVE_READY` gate, entitlement jobs (`app/entitlement.py`) → enrollment enqueue (`app/integrations.py`); payment never rolled back on job failure.
- Dual portal surfaces in main: `/crm/` (Twenty-like) and `/ops/` (bots/scenarios/blasts/support/AI draft) + Mini App preserved for Telegram URL stability (`docs/PORTALS.md`).
- Wire dual-read/emit documented (`docs/DATA_BOUNDARIES.md`, `docs/INTEGRATIONS.md`); 11 pytest modules; CI includes alembic, docker build, Playwright, dual frontend build.
- Honest UI: fiscal checklist, YooKassa skeleton (`secrets_exposed: false`), learning analytics empty until LMS events. Cookie `crm_session` host-only.

### Gaps

- YooKassa webhook returns **501** (`app/crm_routers/portal.py`); adapter not implemented.
- Robokassa adapter still **does not** send `Receipt` — live money without closed fiscal process.
- AI: RAGA/OpenRouter/Ollama status + rules UI exist; draft-only (`sent: False`); providers often «не настроено».
- CMS staff matrix = `sync: manual_v1`; no Keycloak group sync.
- Email campaigns depend on SMTP/Mailu; messenger blasts stronger than email path.
- Vision docs (`PLATFORM_ARCHITECTURE.md` / `PLATFORM_DATA_MODEL.md`) still describe older “единая платформа” — drift vs ADR in `DATA_BOUNDARIES.md`.

### Risks

- **Single worker** advisory-lock SPOF for Outbox + entitlement (`app/worker.py`); `/health` 503 if heartbeat stale.
- CSP `script-src 'unsafe-inline'` required for Next static hydration on `/crm`/`/ops` — raises XSS blast radius if XSS lands.
- Live outreach / unofficial MAX transport must stay behind `OUTREACH_MAX_ENABLED=0`.
- Legacy sslip webhook URLs may still be in env — migrate to `voronka.solo-pr.ru` carefully.

### Verdict

voronka remains the **only mature commercial core**; portal phases made CRM/ops operable by host. Residual risk is **ops resilience + fiscal/live gates**, not missing UI shells.

---

## lms_end

### Quality

- Ownership docs explicit: `docs/LMS_OWNERSHIP.md` — money not LMS; `ACCESS_AUTHORITY=external` default; checkout **410** in external mode (`app/learning_api.py`).
- Portal phase 4: `portal/` HMAC session cookies (forgery/tamper/expiry tests), Bearer meeting mutations (`app/meeting_stubs.py`), staff enrollments/meetings/attendance/sparks stubs, honest empty-states.
- Thin LMS runtime: `app/lms_app.py` + `compose.lms.yaml` (Keycloak `:18081`, OpenOlat `:18082`, adapter DB separate from `funnel`).
- Meetings contract: `docs/MEETINGS.md`; BBB media plane explicitly external (`bbb_installed: false`).

### Gaps

- OpenOlat/Keycloak **not up** on VPS; `lms.solo-pr.ru` is stub/portal-only.
- Enrollment staff UI uses seed store; `fetchEnrollmentsFromAdapter()` returns null until real staff list API.
- Default `LMS_API_PORT=18080` **collides** with live voronka — must remap (solo_pr `BACKEND_ARCHITECTURE.md`).
- Meetings module docstring mentions HMAC headers; runtime auth is **Bearer-only** (doc drift).
- Adapter spark **list** returns `[]` when portal delegates via `LMS_END_URL`.
- Full deletion of vendored `app/crm_*`, `web/`, `site/` still deferred; CI still builds those jobs.

### Risks

- `legacy_crm` still re-enables in-process Robokassa checkout — mis-set env is a money-authority regression.
- Operators may run legacy `compose.yaml` / `compose.platform.yaml` (also default `:18080`) beside LMS-only.
- In-memory meeting journals diverge/restart-lose without unified adapter store.
- BBB join stubs can look “live” while media plane absent — keep empty-states honest.
- Rosobrnadzor expectations ≠ OpenOlat install; compliance is operator process.

### Verdict

lms_end is a **green stub/contract milestone** after #4; **not** an ops-complete home LMS until cutover, port remap, and archive cleanup.

---

## Cross-cutting after phases 1–5

| Theme | Status |
|-------|--------|
| Separate repos / no shared DB | Held |
| Portal hosts + staff chrome | Code done; DNS/TLS on VPS for cms/crm/voronka/lms |
| Wire v1 dual-read | Green in prior smoke; keep contract tests |
| Integration docs in solo_pr | Phase 5 PR |
| SSO Keycloak | Code hooks exist; auth host not live |
| Live Robokassa | Gated; fiscalization open |
| BBB | UI/API stubs only |
| Mailu | Live for vodopetov.ru; CRM consumes status |

### Priority residual board

| ID | Item | Contour |
|----|------|---------|
| R1 | Bring up `compose.lms.yaml` + remap API port + `LMS_*` on solo_pr | lms_end + solo_pr |
| R2 | OIDC/Keycloak on `auth.` + staff group sync | all |
| R3 | Fiscalization / Receipt decision before `ROBOKASSA_LIVE_READY=1` | voronka |
| R4 | Worker HA + backup restore drill | voronka (+ LMS when live) |
| R5 | Delete or quarantine vendored CRM/site trees in lms_end | lms_end |
| R6 | YooKassa adapter or explicit “won’t ship” | voronka |
| R7 | BBB media host decision (never current VPS) | lms_end + ops |
| R8 | Drop unused Prisma dep / Sites elevate footguns | solo_pr |

---

## What portal phases fixed vs Nov-12 audit

| Old blocker | After portals |
|-------------|----------------|
| B1 solo_pr not a hub | Wire + integrations admin + portals status; docs bible |
| B2 no SSO | Still open (OIDC code, not deployed) |
| B6 LMS monorepo + checkout | External mode + 410; trees frozen not deleted |
| B8 circles not in broadcast | Ops campaigns with `asset_id` / identity audience |
| B9 AI config | Ops AI rules UI; draft-only |
| B10 two admin UIs | `/ops` first-class + Mini App kept for TG |
| UX one-login blur | Learner vs cms/crm/voronka/lms hosts |

---

## Anti-scope (unchanged)

- Merge repos / shared Postgres  
- Twenty/Espo/Chatwoot as second CRM  
- BBB install on `213.171.9.30`  
- AI auto-send without approve  
- VPS deploy from this audit document  

---

## Sources

- Portal phases 1–4 merged PRs: solo_pr #4 · voronka #7/#8 · lms_end #4
- Phase 5: this repo `docs/INTEGRATION.md`, `docs/BACKEND_ARCHITECTURE.md` (#5)
- Neighbor docs: voronka `DATA_BOUNDARIES.md` / `PORTALS.md`; lms_end `LMS_OWNERSHIP.md` / `MEETINGS.md`
- Code trees audited at SHAs above (no deploy)
