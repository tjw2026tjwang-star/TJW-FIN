import {
  normalizeSessionRole,
  type AuditEntry,
  type Lead,
  type Quotation,
  type UserSession,
} from '../types';

const STORAGE_KEYS = {
  session: 'tjw_session',
  leads: 'tjw_finance_leads_v1',
  quotations: 'tjw_finance_quotations_v1',
  audit: 'tjw_finance_audit_v2',
} as const;

const LEGACY_SESSION_KEY = 'tjw_finance_session_v1';

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadSession(): UserSession | null {
  const stored = safeRead<UserSession | null>(STORAGE_KEYS.session, null);
  if (!stored) return null;
  return {
    ...stored,
    role: normalizeSessionRole(stored.department, stored.role),
  };
}

export function saveSession(session: UserSession | null): void {
  if (!session) {
    try {
      window.localStorage.removeItem('tjw_session');
      window.localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // ignore
    }
    return;
  }
  safeWrite(STORAGE_KEYS.session, {
    ...session,
    role: normalizeSessionRole(session.department, session.role),
  });
}

export function loadLeads(): Lead[] {
  return safeRead<Lead[]>(STORAGE_KEYS.leads, []);
}

export function saveLeads(leads: Lead[]): void {
  safeWrite(STORAGE_KEYS.leads, leads);
}

export function loadQuotations(): Quotation[] {
  return safeRead<Quotation[]>(STORAGE_KEYS.quotations, []);
}

export function saveQuotations(quotations: Quotation[]): void {
  safeWrite(STORAGE_KEYS.quotations, quotations);
}

export function loadAuditLog(): AuditEntry[] {
  const raw = safeRead<AuditEntry[]>(STORAGE_KEYS.audit, []);
  return Array.isArray(raw) ? raw.filter((item) => item && typeof item.log_id === 'string') : [];
}

/**
 * Append-only persistence guard: never drops previously persisted immutable log_ids.
 */
export function saveAuditLog(entries: AuditEntry[]): void {
  const existing = loadAuditLog();
  const byId = new Map<string, AuditEntry>();
  for (const item of entries) {
    if (item && item.log_id) byId.set(item.log_id, item);
  }
  for (const item of existing) {
    if (item && item.log_id && !byId.has(item.log_id)) {
      byId.set(item.log_id, item);
    }
  }
  const merged = Array.from(byId.values()).sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
  safeWrite(STORAGE_KEYS.audit, merged);
}
