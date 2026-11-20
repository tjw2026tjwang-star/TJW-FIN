import {
  type BillingFrequency,
  type Department,
  type Lead,
  type QuotationLineItem,
} from '../types';
import { generateSafeId } from './sla';

/**
 * Deterministic Malaysian SME baseline fee engine (Step 6) adhering to
 * T.J. Wang Finance Department guidelines:
 * - Co Sec retainer: RM 60–RM 120/mo | Incorporation: RM 1,500–RM 2,500
 * - Accounting: RM 300–RM 1,500/mo (tiered by transaction volume & SST)
 * - Payroll: RM 30–RM 50/employee/mo
 * - Tax (Form C): RM 1,200–RM 3,500/yr
 * - Audit: RM 2,500–RM 8,000+/yr
 */
export function buildBaselineQuotationItems(lead: Lead): QuotationLineItem[] {
  const { scope, entityType } = lead;
  const services: Department[] =
    scope.requestedServices.length > 0 ? scope.requestedServices : [lead.targetDept];

  const turnover = Number(scope.annualTurnoverMyr) || 0;
  const txVol = Number(scope.monthlyTransactionVolume) || 0;
  const headcount = Math.max(0, Math.floor(Number(scope.headcount) || 0));
  const items: QuotationLineItem[] = [];

  const pushItem = (
    dept: Department,
    description: string,
    deliverables: string,
    frequency: BillingFrequency,
    quantity: number,
    unitPriceMyr: number
  ) => {
    const qty = Math.max(1, Math.floor(quantity));
    const unit = Math.round(unitPriceMyr * 100) / 100;
    items.push({
      id: generateSafeId('li'),
      dept,
      description,
      deliverables,
      frequency,
      quantity: qty,
      unitPriceMyr: unit,
      lineTotalMyr: Math.round(qty * unit * 100) / 100,
    });
  };

  if (services.includes('Co Sec')) {
    if (scope.requiresIncorporation || scope.accountingState === 'New Incorporation') {
      const incFee = entityType === 'Sdn Bhd' ? 2000 : 1650;
      pushItem(
        'Co Sec',
        `${entityType === 'Sdn Bhd' ? 'Sdn Bhd' : entityType} Incorporation Package`,
        'SSM name search, Section 14 superform, Section 15 notice, statutory register setup & bank opening resolutions',
        'One-off',
        1,
        incFee
      );
    }

    const cosecMonthly = turnover >= 5000000 ? 120 : turnover >= 1500000 ? 90 : 75;
    pushItem(
      'Co Sec',
      'Company Secretarial Statutory Retainer',
      'Named Company Secretary, registered office maintenance, SSM Annual Return reminders & standard board resolutions',
      'Monthly',
      1,
      cosecMonthly
    );
  }

  if (services.includes('Accounting')) {
    let accMonthly = 350;
    if (txVol > 350 || turnover >= 8000000) {
      accMonthly = 1500;
    } else if (txVol > 200 || turnover >= 4000000) {
      accMonthly = 1100;
    } else if (txVol > 100 || turnover >= 1500000) {
      accMonthly = 750;
    } else if (txVol > 50) {
      accMonthly = 500;
    }

    if (scope.sstRegistered) {
      accMonthly = Math.min(1500, accMonthly + 150);
    }

    pushItem(
      'Accounting',
      `Monthly Bookkeeping & Management Accounts${scope.sstRegistered ? ' (incl. SST-02 Compliance)' : ''}`,
      `Bank reconciliation (~${txVol || 50} tx/mo), monthly P&L & Balance Sheet${scope.sstRegistered ? ', bi-monthly SST-02 return preparation & filing' : ''}`,
      'Monthly',
      1,
      accMonthly
    );

    if (
      scope.accountingState === 'Backlog (1-6 months)' ||
      scope.accountingState === 'Backlog (>6 months)'
    ) {
      const backlogFee = scope.accountingState === 'Backlog (>6 months)' ? 2400 : 1200;
      pushItem(
        'Accounting',
        `Accounting Backlog Catch-Up (${scope.accountingState})`,
        'Historical ledger reconstruction, bank statement reconciliation, and opening balance verification',
        'One-off',
        1,
        backlogFee
      );
    }
  }

  if (services.includes('Payroll')) {
    const staffCount = Math.max(1, headcount);
    const perEmpRate = staffCount >= 30 ? 32 : staffCount >= 15 ? 38 : 45;
    pushItem(
      'Payroll',
      `Monthly Payroll Processing (${staffCount} ${staffCount === 1 ? 'Employee' : 'Employees'})`,
      'Monthly salary computation, digital payslips, EPF, SOCSO, EIS, PCB (MTD) submissions & annual Form EA',
      'Monthly',
      staffCount,
      perEmpRate
    );
  }

  if (services.includes('Tax')) {
    let taxAnnual = 1500;
    if (turnover >= 10000000) {
      taxAnnual = 3500;
    } else if (turnover >= 5000000) {
      taxAnnual = 2800;
    } else if (turnover >= 2000000) {
      taxAnnual = 2200;
    } else if (turnover >= 500000) {
      taxAnnual = 1600;
    } else {
      taxAnnual = 1200;
    }

    pushItem(
      'Tax',
      'Corporate Income Tax Compliance (Form C & CP204)',
      'Annual tax computation, LHDN Form C e-Filing, CP204 tax estimation/revision review & Form E employer filing',
      'Annual',
      1,
      taxAnnual
    );
  }

  if (services.includes('Audit')) {
    let auditAnnual = 2800;
    if (turnover >= 15000000) {
      auditAnnual = 9500;
    } else if (turnover >= 8000000) {
      auditAnnual = 6800;
    } else if (turnover >= 4000000) {
      auditAnnual = 4800;
    } else if (turnover >= 1500000) {
      auditAnnual = 3500;
    } else {
      auditAnnual = 2500;
    }

    pushItem(
      'Audit',
      'Annual Statutory Financial Audit',
      'Independent statutory audit under Companies Act 2016, audited financial statements & management letter',
      'Annual',
      1,
      auditAnnual
    );
  }

  return items;
}

export function computeQuotationTotals(
  items: Array<{ frequency: BillingFrequency; quantity: number; unitPriceMyr: number }>
) {
  let totalSetupFeeMyr = 0;
  let totalMonthlyRecurringMyr = 0;
  let totalAnnualRecurringMyr = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unit = Math.max(0, Number(item.unitPriceMyr) || 0);
    const total = qty * unit;
    if (item.frequency === 'One-off') {
      totalSetupFeeMyr += total;
    } else if (item.frequency === 'Monthly') {
      totalMonthlyRecurringMyr += total;
    } else if (item.frequency === 'Annual') {
      totalAnnualRecurringMyr += total;
    }
  }

  const totalYearOneMyr =
    totalSetupFeeMyr + totalMonthlyRecurringMyr * 12 + totalAnnualRecurringMyr;

  return {
    totalSetupFeeMyr: Math.round(totalSetupFeeMyr * 100) / 100,
    totalMonthlyRecurringMyr: Math.round(totalMonthlyRecurringMyr * 100) / 100,
    totalAnnualRecurringMyr: Math.round(totalAnnualRecurringMyr * 100) / 100,
    totalYearOneMyr: Math.round(totalYearOneMyr * 100) / 100,
  };
}

export const DEFAULT_LEGAL_REMARKS =
  'All professional fees are quoted in Ringgit Malaysia (MYR) and exclude 8% Service Tax (SST) where applicable. Proposal validity is 30 calendar days from issue date. 50% mobilization deposit is payable upon engagement acceptance.';

export const DEFAULT_ASSUMPTIONS =
  'Client provides complete bank statements, invoices, payroll input changes, and statutory documentation within agreed monthly cutoff dates.';

export const DEFAULT_EXCLUSIONS =
  'Government statutory disbursements (SSM/LHDN filing fees), stamp duties, late submission penalties, courier charges, and tax audit defense.';
