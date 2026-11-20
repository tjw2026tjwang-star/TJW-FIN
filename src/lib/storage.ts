import type { AuditEntry, Lead, Quotation, UserSession } from '../types';

const STORAGE_KEYS = {
  session: 'tjw_finance_session_v1',
  leads: 'tjw_finance_leads_v1',
  quotations: 'tjw_finance_quotations_v1',
  audit: 'tjw_finance_audit_v1',
} as const;

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
  return safeRead<UserSession | null>(STORAGE_KEYS.session, null);
}

export function saveSession(session: UserSession | null): void {
  if (!session) {
    try {
      window.localStorage.removeItem(STORAGE_KEYS.session);
    } catch {
      // ignore
    }
    return;
  }
  safeWrite(STORAGE_KEYS.session, session);
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
  return safeRead<AuditEntry[]>(STORAGE_KEYS.audit, []);
}

export function saveAuditLog(entries: AuditEntry[]): void {
  safeWrite(STORAGE_KEYS.audit, entries);
}
