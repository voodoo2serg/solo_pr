import 'server-only';
import {db} from './store';

export type PortalZone = 'lms' | 'cms' | 'crm' | 'voronka';

/** Role labels inside each zone (product matrix, not OpenOlat ACL). */
export const ZONE_ROLE_OPTIONS: Record<PortalZone, string[]> = {
  cms: ['admin', 'editor', 'ops'],
  crm: ['owner', 'partner', 'manager'],
  voronka: ['ops', 'marketer', 'support'],
  lms: ['admin', 'author'],
};

export type StaffZones = Partial<Record<PortalZone, string>>;

export type StaffRoleRow = {
  email: string;
  name: string;
  zones: StaffZones;
  /** Manual grant checklist before Keycloak sync (CRM staff / OpenOlat). */
  checklist: {
    crmStaffGranted: boolean;
    openolatGranted: boolean;
    notes: string;
  };
  updated: string;
  updatedBy: string;
};

export type StaffChecklist = StaffRoleRow['checklist'];

const emptyChecklist = (): StaffChecklist => ({
  crmStaffGranted: false,
  openolatGranted: false,
  notes: '',
});

db.exec(`CREATE TABLE IF NOT EXISTS staff_roles(
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  zones TEXT NOT NULL DEFAULT '{}',
  checklist TEXT NOT NULL DEFAULT '{}',
  updated TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);`);

function parseZones(raw: string): StaffZones {
  try {
    const v = JSON.parse(raw || '{}') as StaffZones;
    const out: StaffZones = {};
    for (const z of ['lms', 'cms', 'crm', 'voronka'] as PortalZone[]) {
      const role = v[z];
      if (typeof role === 'string' && role && ZONE_ROLE_OPTIONS[z].includes(role)) out[z] = role;
    }
    return out;
  } catch {
    return {};
  }
}

function parseChecklist(raw: string): StaffChecklist {
  try {
    const v = JSON.parse(raw || '{}') as Partial<StaffChecklist>;
    return {
      crmStaffGranted: !!v.crmStaffGranted,
      openolatGranted: !!v.openolatGranted,
      notes: typeof v.notes === 'string' ? v.notes.slice(0, 2000) : '',
    };
  } catch {
    return emptyChecklist();
  }
}

function rowFromDb(r: {
  email: string;
  name: string;
  zones: string;
  checklist: string;
  updated: string;
  updated_by: string;
}): StaffRoleRow {
  return {
    email: r.email,
    name: r.name || '',
    zones: parseZones(r.zones),
    checklist: parseChecklist(r.checklist),
    updated: r.updated,
    updatedBy: r.updated_by || '',
  };
}

export function listStaffRoles(): StaffRoleRow[] {
  const rows = db
    .prepare('SELECT email,name,zones,checklist,updated,updated_by FROM staff_roles ORDER BY email ASC')
    .all() as {
    email: string;
    name: string;
    zones: string;
    checklist: string;
    updated: string;
    updated_by: string;
  }[];
  return rows.map(rowFromDb);
}

export function getStaffRolesByEmail(email: string): StaffRoleRow | null {
  const r = db
    .prepare('SELECT email,name,zones,checklist,updated,updated_by FROM staff_roles WHERE email=?')
    .get(String(email || '').trim().toLowerCase()) as
    | {
        email: string;
        name: string;
        zones: string;
        checklist: string;
        updated: string;
        updated_by: string;
      }
    | undefined;
  return r ? rowFromDb(r) : null;
}

export function upsertStaffRole(input: {
  email: string;
  name?: string;
  zones: StaffZones;
  checklist?: Partial<StaffChecklist>;
  updatedBy: string;
}): StaffRoleRow {
  const email = String(input.email || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Некорректный email');
  const zones: StaffZones = {};
  for (const z of ['lms', 'cms', 'crm', 'voronka'] as PortalZone[]) {
    const role = input.zones?.[z];
    if (typeof role === 'string' && role && ZONE_ROLE_OPTIONS[z].includes(role)) zones[z] = role;
  }
  if (!Object.keys(zones).length) throw new Error('Укажите хотя бы одну зону');
  const prev = getStaffRolesByEmail(email);
  const checklist: StaffChecklist = {
    ...emptyChecklist(),
    ...(prev?.checklist || {}),
    ...(input.checklist || {}),
  };
  const name = (input.name ?? prev?.name ?? '').trim().slice(0, 120);
  const updated = new Date().toISOString();
  db.prepare(
    `INSERT INTO staff_roles(email,name,zones,checklist,updated,updated_by) VALUES(?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET name=excluded.name,zones=excluded.zones,checklist=excluded.checklist,updated=excluded.updated,updated_by=excluded.updated_by`,
  ).run(email, name, JSON.stringify(zones), JSON.stringify(checklist), updated, input.updatedBy);
  return getStaffRolesByEmail(email)!;
}

export function deleteStaffRole(email: string) {
  db.prepare('DELETE FROM staff_roles WHERE email=?').run(
    String(email || '')
      .trim()
      .toLowerCase(),
  );
}

/** Zones for a signed-in staff user. Without a matrix row, bootstrap admins get no zones (not implicit full-admin). */
export function zonesForUser(user: {email: string; role: string} | null | undefined): StaffZones {
  if (!user || user.role !== 'admin') return {};
  const row = getStaffRolesByEmail(user.email);
  if (row) return row.zones;
  // Legacy / test admins without a matrix row: CMS-only until recorded in «Администраторы и роли».
  // Bootstrap emails are filled by ensureBootstrapStaffMatrix() before checks.
  return {cms: 'admin'};
}

export function userHasZone(
  user: {email: string; role: string} | null | undefined,
  zone: PortalZone,
): boolean {
  const zones = zonesForUser(user);
  return !!zones[zone];
}

/** Ensure bootstrap operators have explicit matrix rows (idempotent). */
export function ensureBootstrapStaffMatrix() {
  const bootstrap: {email: string; name: string; zones: StaffZones}[] = [
    {
      email: 'cms@vodopetov.ru',
      name: 'Редактор CMS',
      zones: {cms: 'editor'},
    },
    {
      email: 'ops@vodopetov.ru',
      name: 'Операции сайта',
      zones: {cms: 'ops', crm: 'manager'},
    },
    {
      email: 'community@vodopetov.ru',
      name: 'Сообщество',
      zones: {cms: 'ops', voronka: 'support'},
    },
  ];
  for (const b of bootstrap) {
    if (!getStaffRolesByEmail(b.email)) {
      upsertStaffRole({
        email: b.email,
        name: b.name,
        zones: b.zones,
        checklist: emptyChecklist(),
        updatedBy: 'bootstrap',
      });
    }
  }
}

/** Owner-style full matrix for interactive admin.mjs promotions when no row exists. */
export function ensureFullOwnerMatrix(email: string, name: string, updatedBy: string) {
  if (getStaffRolesByEmail(email)) return;
  upsertStaffRole({
    email,
    name,
    zones: {cms: 'admin', crm: 'owner', voronka: 'ops', lms: 'admin'},
    checklist: {crmStaffGranted: false, openolatGranted: false, notes: 'Выдано через admin.mjs — отметьте ручные гранты CRM/OL'},
    updatedBy,
  });
}
