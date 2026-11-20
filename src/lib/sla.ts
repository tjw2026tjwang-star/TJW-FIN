import type { Lead } from '../types';

export const SLA_WORKING_DAYS_LIMIT = 4;

/**
 * Counts working days elapsed between receivedAtIso and referenceIso (or now),
 * excluding weekends (Saturday and Sunday).
 */
export function calculateWorkingDaysElapsed(
  receivedAtIso: string,
  referenceIso: string | null
): number {
  const start = new Date(receivedAtIso);
  const end = referenceIso ? new Date(referenceIso) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (endDay <= startDay) {
    return 0;
  }

  let workingDays = 0;
  const cursor = new Date(startDay);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= endDay) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return workingDays;
}

export interface LeadSlaStatus {
  workingDaysElapsed: number;
  limitDays: number;
  isBreached: boolean;
  isFrozen: boolean;
  label: string;
}

export function evaluateLeadSla(lead: Lead): LeadSlaStatus {
  // Freeze SLA timer at firstContactAt once Contacted
  const isFrozen = lead.contactStatus === 'Contacted' && Boolean(lead.firstContactAt);
  const workingDaysElapsed = calculateWorkingDaysElapsed(
    lead.receivedAt,
    isFrozen ? lead.firstContactAt : null
  );

  if (lead.contactStatus === 'Unreachable') {
    return {
      workingDaysElapsed,
      limitDays: SLA_WORKING_DAYS_LIMIT,
      isBreached: false,
      isFrozen: true,
      label: `Unreachable · ${workingDaysElapsed}d`,
    };
  }

  if (lead.contactStatus === 'Contacted') {
    const breached = workingDaysElapsed > SLA_WORKING_DAYS_LIMIT;
    return {
      workingDaysElapsed,
      limitDays: SLA_WORKING_DAYS_LIMIT,
      isBreached: breached,
      isFrozen: true,
      label: breached
        ? `Contacted Late · ${workingDaysElapsed}d`
        : `SLA Met · ${workingDaysElapsed}d (Frozen)`,
    };
  }

  // Pending Contact: breach when working days elapsed >= 4
  const isBreached = workingDaysElapsed >= SLA_WORKING_DAYS_LIMIT;
  return {
    workingDaysElapsed,
    limitDays: SLA_WORKING_DAYS_LIMIT,
    isBreached,
    isFrozen: false,
    label: isBreached
      ? `SLA BREACH / OVERDUE · ${workingDaysElapsed}d`
      : `Pending · ${workingDaysElapsed}/${SLA_WORKING_DAYS_LIMIT} working days`,
  };
}

export function formatMyr(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `RM ${safe.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Formats a Date into precise ISO 8601 in Asia/Kuala_Lumpur (UTC+8),
 * e.g. 2026-11-20T14:35:07.123+08:00
 */
export function formatKualaLumpurIso(date: Date = new Date()): string {
  const klMs = date.getTime() + 8 * 60 * 60 * 1000;
  const kl = new Date(klMs);
  const y = kl.getUTCFullYear();
  const m = String(kl.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kl.getUTCDate()).padStart(2, '0');
  const hh = String(kl.getUTCHours()).padStart(2, '0');
  const mm = String(kl.getUTCMinutes()).padStart(2, '0');
  const ss = String(kl.getUTCSeconds()).padStart(2, '0');
  const ms = String(kl.getUTCMilliseconds()).padStart(3, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}+08:00`;
}

export function generateAuditLogId(existingCount: number, date: Date = new Date()): string {
  const klMs = date.getTime() + 8 * 60 * 60 * 1000;
  const kl = new Date(klMs);
  const y = kl.getUTCFullYear();
  const m = String(kl.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kl.getUTCDate()).padStart(2, '0');
  const seq = String(existingCount + 1).padStart(3, '0');
  return `LOG-${y}${m}${d}-${seq}`;
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

export function generateLeadCode(existingCount: number): string {
  const seq = String(existingCount + 1).padStart(4, '0');
  return `LEAD-${seq}`;
}

export function generateQuoteNumber(existingCount: number): string {
  const seq = String(existingCount + 1).padStart(4, '0');
  return `QT-${seq}`;
}

export const DEFAULT_VALIDITY_DAYS = 7;

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeValidUntilDate(baseIso: string, validityDays: number): string {
  const base = new Date(baseIso);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const days = Math.max(1, Math.floor(Number(validityDays) || DEFAULT_VALIDITY_DAYS));
  const target = new Date(safeBase.getFullYear(), safeBase.getMonth(), safeBase.getDate() + days);
  return toYmd(target);
}

export function computeValidityDaysFromDates(baseIso: string, validUntilYmd: string): number {
  const base = new Date(baseIso);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const baseStart = new Date(safeBase.getFullYear(), safeBase.getMonth(), safeBase.getDate());
  const parts = validUntilYmd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return DEFAULT_VALIDITY_DAYS;
  }
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const diffMs = target.getTime() - baseStart.getTime();
  return Math.max(1, Math.round(diffMs / 86400000));
}

export function formatValiditySummary(validityDays: number, validUntil: string): string {
  const days = Math.max(1, Math.floor(Number(validityDays) || DEFAULT_VALIDITY_DAYS));
  const dateLabel = validUntil || computeValidUntilDate(new Date().toISOString(), days);
  return `${days} days (Valid until ${dateLabel})`;
}

