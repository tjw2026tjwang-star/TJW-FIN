import type { Department, Lead, OrgConfig } from '../types';

export const DEFAULT_MY_HOLIDAYS_2026: string[] = [
  '2026-01-01', // New Year's Day
  '2026-02-01', // Federal Territory Day & Thaipusam
  '2026-02-02', // Federal Territory Day Observed
  '2026-02-17', // Chinese New Year
  '2026-02-18', // Chinese New Year Day 2
  '2026-03-07', // Nuzul Al-Quran
  '2026-03-20', // Hari Raya Aidilfitri
  '2026-03-21', // Hari Raya Aidilfitri Day 2
  '2026-05-01', // Labour Day
  '2026-05-27', // Hari Raya Haji
  '2026-05-31', // Wesak Day
  '2026-06-01', // Agong's Birthday
  '2026-06-16', // Awal Muharram
  '2026-08-25', // Maulidur Rasul
  '2026-08-31', // Merdeka Day
  '2026-09-16', // Malaysia Day
  '2026-11-08', // Deepavali
  '2026-11-09', // Deepavali Observed
  '2026-12-25', // Christmas Day
];

export function buildDefaultOrgConfig(currentUid: string, currentName: string): OrgConfig {
  const safeName = currentName.trim() || 'Operations Lead';
  return {
    slaWorkingDays: 4,
    publicHolidays: [...DEFAULT_MY_HOLIDAYS_2026],
    departmentPics: {
      CoSec: { uid: currentUid, name: `${safeName} (Co Sec)`, title: 'Company Secretary PIC' },
      Accounting: { uid: currentUid, name: `${safeName} (Acc)`, title: 'Accounting Manager PIC' },
      Audit: { uid: currentUid, name: `${safeName} (Audit)`, title: 'Audit Manager PIC' },
      Tax: { uid: currentUid, name: `${safeName} (Tax)`, title: 'Tax Advisory PIC' },
      Payroll: { uid: currentUid, name: `${safeName} (Payroll)`, title: 'Payroll Operations PIC' },
    },
    approverIds: [currentUid],
    updatedBy: currentUid,
  };
}

function toIsoDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Counts working days elapsed between receivedAtIso and referenceIso,
 * excluding weekends (Saturday & Sunday) and configured Malaysian public holidays.
 */
export function calculateWorkingDaysElapsed(
  receivedAtIso: string,
  referenceIso: string | null,
  publicHolidays: string[]
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

  const holidaySet = new Set(publicHolidays);
  let workingDays = 0;
  const cursor = new Date(startDay);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= endDay) {
    const dayOfWeek = cursor.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidaySet.has(toIsoDateKey(cursor));
    if (!isWeekend && !isHoliday) {
      workingDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return workingDays;
}

export interface LeadSlaEvaluation {
  workingDaysElapsed: number;
  thresholdDays: number;
  isBreached: boolean;
  isApproaching: boolean;
  effectiveStatus: 'Compliant' | 'Breached' | 'Pending' | 'Closed';
  label: string;
}

export function evaluateLeadSla(
  lead: Lead,
  thresholdDays: number,
  publicHolidays: string[]
): LeadSlaEvaluation {
  const referenceIso =
    lead.contactStatus === 'Contacted' && lead.firstContactAtIso
      ? lead.firstContactAtIso
      : null;

  const workingDaysElapsed = calculateWorkingDaysElapsed(
    lead.receivedAtIso,
    referenceIso,
    publicHolidays
  );

  if (lead.contactStatus === 'Unreachable / Disqualified') {
    return {
      workingDaysElapsed,
      thresholdDays,
      isBreached: false,
      isApproaching: false,
      effectiveStatus: 'Closed',
      label: `Closed · ${workingDaysElapsed}d`,
    };
  }

  if (lead.contactStatus === 'Contacted') {
    const breached = workingDaysElapsed > thresholdDays;
    return {
      workingDaysElapsed,
      thresholdDays,
      isBreached: breached,
      isApproaching: false,
      effectiveStatus: breached ? 'Breached' : 'Compliant',
      label: breached
        ? `Late Contact · ${workingDaysElapsed}d`
        : `SLA Met · ${workingDaysElapsed}d`,
    };
  }

  // Pending Contact
  const breached = workingDaysElapsed >= thresholdDays;
  const approaching = !breached && workingDaysElapsed >= Math.max(1, thresholdDays - 1);

  return {
    workingDaysElapsed,
    thresholdDays,
    isBreached: breached,
    isApproaching: approaching,
    effectiveStatus: breached ? 'Breached' : 'Pending',
    label: breached
      ? `SLA Breached · ${workingDaysElapsed}d`
      : approaching
        ? `Due Soon · ${workingDaysElapsed}/${thresholdDays}d`
        : `On Track · ${workingDaysElapsed}/${thresholdDays}d`,
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
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function generateLeadCode(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(1000 + Math.random() * 9000);
  return `LD-${year}-${num}`;
}

export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(1000 + Math.random() * 9000);
  return `QT-${year}-${num}`;
}

export function computeQuotationTotals(
  items: Array<{ frequency: string; quantity: number; unitPriceMyr: number }>
) {
  let totalSetupMyr = 0;
  let totalMonthlyMyr = 0;
  let totalAnnualMyr = 0;

  for (const item of items) {
    const lineTotal = Math.max(0, Number(item.quantity || 1) * Number(item.unitPriceMyr || 0));
    if (item.frequency === 'One-off') {
      totalSetupMyr += lineTotal;
    } else if (item.frequency === 'Monthly') {
      totalMonthlyMyr += lineTotal;
    } else if (item.frequency === 'Annual') {
      totalAnnualMyr += lineTotal;
    }
  }

  const totalContractValueMyr = totalSetupMyr + totalMonthlyMyr * 12 + totalAnnualMyr;
  return {
    totalSetupMyr: Math.round(totalSetupMyr * 100) / 100,
    totalMonthlyMyr: Math.round(totalMonthlyMyr * 100) / 100,
    totalAnnualMyr: Math.round(totalAnnualMyr * 100) / 100,
    totalContractValueMyr: Math.round(totalContractValueMyr * 100) / 100,
  };
}

export function getDeptShortCode(dept: Department): string {
  switch (dept) {
    case 'CoSec':
      return 'Co Sec';
    case 'Accounting':
      return 'Acc';
    case 'Audit':
      return 'Aud';
    case 'Tax':
      return 'Tax';
    case 'Payroll':
      return 'Pay';
  }
}
