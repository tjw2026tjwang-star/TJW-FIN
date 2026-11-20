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
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

export function generateLeadCode(existingCount: number): string {
  const year = new Date().getFullYear();
  const seq = String(existingCount + 1).padStart(4, '0');
  return `TJW-LD-${year}-${seq}`;
}

export function generateQuoteNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  const seq = String(existingCount + 1).padStart(4, '0');
  return `TJW-QT-${year}-${seq}`;
}
