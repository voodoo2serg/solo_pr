/** Staff and public portal hostnames for solo-pr.ru (SPO-20). */

export const PORTAL_HOSTS = {
  public: 'solo-pr.ru',
  cms: 'cms.solo-pr.ru',
  crm: 'crm.solo-pr.ru',
  voronka: 'voronka.solo-pr.ru',
  lms: 'lms.solo-pr.ru',
} as const;

export const PORTAL_URLS = {
  public: 'https://solo-pr.ru',
  cms: 'https://cms.solo-pr.ru',
  crm: 'https://crm.solo-pr.ru',
  voronka: 'https://voronka.solo-pr.ru',
  lms: 'https://lms.solo-pr.ru',
} as const;

export type PortalZone = 'lms' | 'cms' | 'crm' | 'voronka';
export type PortalKind = 'public' | PortalZone | 'local';

export const PORTAL_ZONE_LABELS: Record<PortalZone, string> = {
  cms: 'CMS',
  crm: 'CRM',
  voronka: 'Voronka',
  lms: 'LMS',
};

export function normalizeHost(host: string | null | undefined): string {
  return String(host || '')
    .split(':')[0]
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

/** Resolve which portal a Host header belongs to. Localhost → local (dev: all surfaces). */
export function resolvePortalKind(host: string | null | undefined): PortalKind {
  const h = normalizeHost(host);
  if (!h || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') || h.endsWith('.sslip.io')) {
    return 'local';
  }
  if (h === PORTAL_HOSTS.cms || h.startsWith('cms.')) return 'cms';
  if (h === PORTAL_HOSTS.crm || h.startsWith('crm.')) return 'crm';
  if (h === PORTAL_HOSTS.voronka || h.startsWith('voronka.')) return 'voronka';
  if (h === PORTAL_HOSTS.lms || h.startsWith('lms.') || h.startsWith('learn.')) return 'lms';
  if (h === PORTAL_HOSTS.public || h === `www.${PORTAL_HOSTS.public}`) return 'public';
  return 'public';
}

export function portalUrl(zone: keyof typeof PORTAL_URLS, path = '/'): string {
  const base = PORTAL_URLS[zone].replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base + p;
}

/** Origins allowed for browser POSTs (apex + staff subdomains). Cookie Domain is never widened. */
export function allowedBrowserOrigins(reqHost?: string | null, reqUrl?: string): string[] {
  const out = new Set<string>(Object.values(PORTAL_URLS));
  const site = (process.env.SITE_ORIGIN || '').replace(/\/$/, '');
  if (site) out.add(site);
  if (reqUrl) {
    try {
      out.add(new URL(reqUrl).origin);
    } catch {
      /* ignore */
    }
  }
  const host = normalizeHost(reqHost);
  if (host) {
    out.add(`https://${host}`);
    out.add(`http://${host}`);
  }
  // Dev / CI
  out.add('https://test.local');
  out.add('http://test.local');
  out.add('http://localhost:3000');
  out.add('http://127.0.0.1:3000');
  return [...out];
}

export function isAllowedBrowserOrigin(
  origin: string | null | undefined,
  reqHost?: string | null,
  reqUrl?: string,
): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const allowed = allowedBrowserOrigins(reqHost, reqUrl);
    if (allowed.includes(parsed.origin)) return true;
    // Same host as the request (covers preview hosts)
    if (reqHost && normalizeHost(parsed.host) === normalizeHost(reqHost)) return true;
    return false;
  } catch {
    return false;
  }
}

export type PortalStatusRow = {
  id: PortalZone | 'public';
  label: string;
  url: string;
  role: string;
  lastCheck: {status: string; at: string} | null;
  note?: string;
};

/** Honest portal directory for Integrations (SPO-26). Does not claim LMS healthy without config. */
export function portalsStatusPublic(opts?: {
  lmsConfigured?: boolean;
  lmsEnabled?: boolean;
  lmsLast?: {status: string; at: string} | null;
}): PortalStatusRow[] {
  const now = new Date().toISOString();
  const lmsConfigured = !!opts?.lmsConfigured;
  const lmsEnabled = !!opts?.lmsEnabled;
  const lmsLast = opts?.lmsLast || null;
  return [
    {
      id: 'public',
      label: 'Публичный сайт',
      url: PORTAL_URLS.public,
      role: 'learner «Войти» → ЛК',
      lastCheck: {status: 'documented', at: now},
    },
    {
      id: 'cms',
      label: 'CMS',
      url: PORTAL_URLS.cms,
      role: 'редакция /admin',
      lastCheck: {status: 'host-ready', at: now},
      note: 'Host cms.* → solo_pr /admin (nginx/Caddy).',
    },
    {
      id: 'crm',
      label: 'CRM',
      url: PORTAL_URLS.crm,
      role: 'voronka /crm/',
      lastCheck: {status: 'external', at: now},
      note: 'UI в репозитории voronka — не в этом приложении.',
    },
    {
      id: 'voronka',
      label: 'Voronka',
      url: PORTAL_URLS.voronka,
      role: 'боты / сценарии',
      lastCheck: {status: 'external', at: now},
      note: 'Ops UI в voronka — не в этом приложении.',
    },
    {
      id: 'lms',
      label: 'LMS',
      url: PORTAL_URLS.lms,
      role: 'OpenOlat + adapter',
      lastCheck: lmsLast,
      note: !lmsEnabled
        ? 'Stub-хост. OpenOlat не считается healthy, пока LMS_ENABLED и URL не заданы.'
        : !lmsConfigured
          ? 'Хост объявлен; секрет/URL LMS не настроены — не healthy OpenOlat.'
          : 'Adapter URL задан; статус ping — в блоке lms_end выше.',
    },
  ];
}

export function clientPortalKind(): PortalKind {
  if (typeof window === 'undefined') return 'local';
  return resolvePortalKind(window.location.host);
}

export function cmsAdminHref(path = '/admin'): string {
  if (typeof window === 'undefined') return path;
  const kind = clientPortalKind();
  if (kind === 'cms' || kind === 'local') return path;
  return portalUrl('cms', path);
}
