import type { OrgConfig, UserProfile } from '../types';
import {
  approveQuotation,
  createLeadFromTriage,
  createQuotationWithItems,
  logOutreachAndStatus,
  saveLeadScope,
  saveQuotationDraftOrSubmit,
} from './firestoreService';

export interface SampleInboundEmail {
  id: string;
  label: string;
  departmentHint: string;
  subject: string;
  body: string;
}

export const SAMPLE_INBOUND_EMAILS: SampleInboundEmail[] = [
  {
    id: 'incorporation_cosec',
    label: 'Sdn Bhd Incorporation + Co Sec & Bookkeeping',
    departmentHint: 'Co Sec · Accounting',
    subject: 'Inquiry: New Sdn Bhd Incorporation, Co Sec Retainer & Cloud Accounting',
    body: `Hi Meridian Advisory Team,

We are launching a new B2B logistics software company in Kuala Lumpur called "Klang Valley Nexus Sdn Bhd" (proposed name) with 2 Malaysian directors and RM 100,000 paid-up capital.

We need assistance with:
1. Full SSM Sdn Bhd incorporation and company secretarial retainer.
2. Monthly cloud bookkeeping setup (estimated ~80 bank transactions/month, projected Year-1 turnover RM 1.2M).
3. Initial registration for EPF, SOCSO, and EIS as we plan to hire 6 engineers next quarter.

Could your team share an indicative fee proposal and timeline?

Best regards,
Farah Liyana binti Razak
Co-Founder & Director
farah@kvnexus.my
+60 12-384 9102`,
  },
  {
    id: 'backlog_audit_sst',
    label: 'Backlog Accounting + SST-02 + Statutory Audit',
    departmentHint: 'Accounting · Audit · Tax',
    subject: 'Urgent: FY2025 Backlog Accounts, SST Filing & Statutory Audit Quote',
    body: `Dear Finance & Audit Department,

Our previous internal accounts clerk resigned 4 months ago and we have a backlog of bookkeeping for Q3 and Q4 for Seri Mutiara Precision Parts Sdn Bhd (SST-registered manufacturer in Shah Alam).

Key details:
- Annual revenue around RM 6.8 million
- Roughly 320 bank transactions per month across Maybank and CIMB
- Need to catch up 5 months of bookkeeping, file overdue SST-02 return, complete our statutory year-end audit, and prepare Form C corporate tax filing.

Please contact me urgently on WhatsApp or phone to discuss scope.

Regards,
Tan Boon Keat
Managing Director, Seri Mutiara Precision Parts Sdn Bhd
bk.tan@serimutiara-parts.com.my
019-227 6481`,
  },
  {
    id: 'payroll_tax_sme',
    label: 'Payroll Outsourcing (24 Staff) + Form E / Form C',
    departmentHint: 'Payroll · Tax',
    subject: 'Request for Proposal: Monthly Payroll Outsourcing & Corporate Tax Compliance',
    body: `Hello,

We operate three F&B specialty coffee outlets in Petaling Jaya under Kopi & Craft Roasters Sdn Bhd. We currently have 24 full-time staff and want to outsource monthly payroll processing including EPF, SOCSO, EIS, PCB, HRDF submissions, and annual Form EA / Form E filings.

We would also like to engage your tax team for CP204 estimation and annual Form C corporate tax submission (annual turnover ~RM 3.4M).

Thank you,
Nadia Chong
Operations Director
nadia@kopicraft.my
+60 16-773 4510`,
  },
];

function daysAgoIso(calendarDaysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - calendarDaysAgo);
  return d.toISOString();
}

export async function seedWorkspaceSamples(
  actor: UserProfile,
  orgConfig: OrgConfig
): Promise<void> {
  // 1. Breached SLA lead (8 calendar days ago -> >= 5 working days uncontacted)
  await createLeadFromTriage(
    {
      emailSubject: 'Urgent: Statutory Audit & Form C Corporate Tax for FYE Dec 2025',
      rawEmailBody:
        'Good morning, we are seeking a licensed audit firm for Selat Marine Engineering Sdn Bhd (turnover RM 9.2M, 42 staff) for our upcoming statutory audit and Form C submission. Please reach out this week. Contact: Encik Hafizuddin (+60 12-604 8821, hafiz@selatmarine.com.my).',
      companyName: 'Selat Marine Engineering Sdn Bhd',
      contactPerson: 'Hafizuddin bin Salleh',
      contactEmail: 'hafiz@selatmarine.com.my',
      contactPhone: '+60 12-604 8821',
      inquirySummary:
        'Mid-market marine engineering Sdn Bhd (RM 9.2M turnover) requesting statutory year-end audit and corporate Form C tax compliance.',
      serviceLines: ['Audit', 'Tax'],
      assignedDept: 'Audit',
      entityType: 'Sdn Bhd',
      receivedAtIso: daysAgoIso(9),
    },
    actor,
    orgConfig
  );

  // 2. Pending Contact within SLA (1 day ago)
  await createLeadFromTriage(
    {
      emailSubject: 'New Sdn Bhd Setup & Monthly Company Secretarial Retainer',
      rawEmailBody:
        'Hi team, looking to incorporate Apex Solar Grids Sdn Bhd with 3 shareholders and appoint a company secretary in KL. Please call me at 017-891 2240. — Mei Ling Wong (meiling@apexsolar.my).',
      companyName: 'Apex Solar Grids Sdn Bhd',
      contactPerson: 'Mei Ling Wong',
      contactEmail: 'meiling@apexsolar.my',
      contactPhone: '+60 17-891 2240',
      inquirySummary:
        'New renewable energy venture requiring Sdn Bhd incorporation, constitution drafting, and ongoing SSM company secretarial retainer.',
      serviceLines: ['CoSec'],
      assignedDept: 'CoSec',
      entityType: 'Sdn Bhd',
      receivedAtIso: daysAgoIso(1),
    },
    actor,
    orgConfig
  );

  // 3. Contacted & Scoped, ready for Step 6 AI Quotation Generation
  const lead3 = await createLeadFromTriage(
    {
      emailSubject: 'Monthly Bookkeeping Backlog & SST-02 Advisory',
      rawEmailBody:
        'We need accounting catch-up for 4 months of backlog and ongoing monthly management accounts plus bi-monthly SST-02 filings for Damansara MedTech Sdn Bhd.',
      companyName: 'Damansara MedTech Sdn Bhd',
      contactPerson: 'Dr. Kavitha Subramaniam',
      contactEmail: 'kavitha@damansaramedtech.my',
      contactPhone: '+60 12-901 3348',
      inquirySummary:
        'Medical device distributor with 4 months bookkeeping backlog seeking monthly cloud accounting, SST-02 compliance, and payroll for 14 staff.',
      serviceLines: ['Accounting', 'Payroll'],
      assignedDept: 'Accounting',
      entityType: 'Sdn Bhd',
      receivedAtIso: daysAgoIso(4),
    },
    actor,
    orgConfig
  );

  await logOutreachAndStatus(
    lead3,
    {
      contactStatus: 'Contacted',
      outreachChannel: 'Phone',
      outreachNotes:
        'Completed 25-minute discovery call with Dr. Kavitha. Confirmed Xero migration, 4-month backlog, SST registration active, and 14 salaried staff.',
    },
    actor,
    orgConfig
  );

  await saveLeadScope(
    { ...lead3, contactStatus: 'Contacted' },
    {
      entityType: 'Sdn Bhd',
      annualTurnoverMyr: 4200000,
      monthlyBankTxCount: 210,
      headcount: 14,
      accountingState: 'Backlog (1-6 months)',
      sstRegistered: true,
      serviceLines: ['Accounting', 'Payroll'],
      scopeNotes:
        'Requires 4-month catch-up bookkeeping on Xero, ongoing monthly management accounts (210 tx/mo), bi-monthly SST-02 preparation, and monthly payroll processing for 14 employees including EPF/SOCSO/EIS/PCB.',
    },
    actor
  );

  // 4. Quotation Pending Finance Approval (Step 7)
  const lead4 = await createLeadFromTriage(
    {
      emailSubject: 'Full Corporate Compliance Package — Payroll, Tax & Co Sec',
      rawEmailBody:
        'Requesting bundled corporate services quote for Nusantara Cloud Logistics Sdn Bhd (22 staff, RM 5.5M revenue).',
      companyName: 'Nusantara Cloud Logistics Sdn Bhd',
      contactPerson: 'Daniel Lim Wei Jie',
      contactEmail: 'daniel.lim@nusantaracloud.my',
      contactPhone: '+60 16-445 7820',
      inquirySummary:
        'Logistics SaaS company seeking bundled Co Sec retainer, monthly payroll for 22 staff, and corporate Form C + CP204 tax filings.',
      serviceLines: ['Payroll', 'Tax', 'CoSec'],
      assignedDept: 'Payroll',
      entityType: 'Sdn Bhd',
      receivedAtIso: daysAgoIso(5),
    },
    actor,
    orgConfig
  );

  await logOutreachAndStatus(
    lead4,
    {
      contactStatus: 'Contacted',
      outreachChannel: 'WhatsApp',
      outreachNotes: 'Reviewed headcount breakdown (22 full-time MY staff) and confirmed FYE Dec 31.',
    },
    actor,
    orgConfig
  );

  const scopedLead4 = {
    ...lead4,
    contactStatus: 'Contacted' as const,
    scopeCompleted: true,
    entityType: 'Sdn Bhd' as const,
    annualTurnoverMyr: 5500000,
    monthlyBankTxCount: 165,
    headcount: 22,
    accountingState: 'Up-to-date' as const,
    sstRegistered: true,
    scopeNotes:
      'Bundled retainer covering monthly payroll for 22 employees (EPF/SOCSO/EIS/PCB/EA), annual Form C + CP204 corporate tax computation, and monthly Co Sec statutory retainer.',
  };
  await saveLeadScope(scopedLead4, scopedLead4, actor);

  const quote4 = await createQuotationWithItems(
    scopedLead4,
    {
      line_items: [
        {
          serviceCategory: 'Payroll',
          description: 'Monthly Payroll Processing & Statutory Submissions',
          deliverables: 'Payslips, bank payment file, EPF, SOCSO, EIS, PCB, HRDF & annual Form EA/E',
          frequency: 'Monthly',
          quantity: 22,
          unitPriceMyr: 40,
        },
        {
          serviceCategory: 'Tax',
          description: 'Corporate Income Tax Filing (Form C) & CP204 Estimation',
          deliverables: 'Tax computation, Form C e-Filing, CP204 submission & revision review',
          frequency: 'Annual',
          quantity: 1,
          unitPriceMyr: 2400,
        },
        {
          serviceCategory: 'CoSec',
          description: 'Company Secretarial Statutory Retainer',
          deliverables: 'Named Company Secretary, registered office, SSM Annual Return & standard resolutions',
          frequency: 'Monthly',
          quantity: 1,
          unitPriceMyr: 100,
        },
      ],
      legal_remarks:
        'Fees quoted in MYR and exclude 8% Malaysian Service Tax (SST) where applicable. Proposal valid for 30 calendar days from date of issue. 50% deposit due upon letter of engagement acceptance.',
      assumptions:
        'Payroll input changes provided 5 working days prior to pay run. Audited or finalized management accounts supplied at least 45 days before LHDN Form C deadline.',
      exclusions:
        'SSM statutory filing fees, stamp duties, courier disbursements, LHDN tax audit defense, and special share restructuring resolutions.',
    },
    actor,
    orgConfig
  );

  await saveQuotationDraftOrSubmit(
    quote4,
    {
      scopeNotes: quote4.scopeNotes,
      legalRemarks: quote4.legalRemarks,
      assumptions: quote4.assumptions,
      exclusions: quote4.exclusions,
    },
    [],
    [],
    true,
    actor
  );

  // 5. Approved Quotation ready for Step 8 Dispatch (if current actor is admin/approver)
  const lead5 = await createLeadFromTriage(
    {
      emailSubject: 'Sdn Bhd Incorporation & Accounting Setup for Retail Brand',
      rawEmailBody:
        'Looking to set up Bukit Bintang Artisan Goods Sdn Bhd and engage monthly bookkeeping and Co Sec.',
      companyName: 'Bukit Bintang Artisan Goods Sdn Bhd',
      contactPerson: 'Siti Nurhaliza Zainal',
      contactEmail: 'siti@bbartisan.my',
      contactPhone: '+60 12-511 9034',
      inquirySummary:
        'New consumer retail Sdn Bhd requiring full incorporation, Co Sec retainer, and starter monthly bookkeeping.',
      serviceLines: ['CoSec', 'Accounting'],
      assignedDept: 'CoSec',
      entityType: 'Sdn Bhd',
      receivedAtIso: daysAgoIso(3),
    },
    actor,
    orgConfig
  );

  await logOutreachAndStatus(
    lead5,
    {
      contactStatus: 'Contacted',
      outreachChannel: 'Email',
      outreachNotes: 'Confirmed 2 directors, RM 50,000 paid-up capital, ~60 bank transactions/month.',
    },
    actor,
    orgConfig
  );

  const scopedLead5 = {
    ...lead5,
    contactStatus: 'Contacted' as const,
    scopeCompleted: true,
    entityType: 'Sdn Bhd' as const,
    annualTurnoverMyr: 850000,
    monthlyBankTxCount: 60,
    headcount: 4,
    accountingState: 'New Incorporation' as const,
    sstRegistered: false,
    scopeNotes:
      'New Sdn Bhd incorporation (2 directors), monthly Co Sec retainer, and starter monthly bookkeeping (~60 transactions/month).',
  };
  await saveLeadScope(scopedLead5, scopedLead5, actor);

  const quote5 = await createQuotationWithItems(
    scopedLead5,
    {
      line_items: [
        {
          serviceCategory: 'CoSec',
          description: 'Sdn Bhd Incorporation Package (SSM Registration)',
          deliverables: 'Name search, Section 14 superform filing, Section 15 notice, First Board Resolution & bank opening set',
          frequency: 'One-off',
          quantity: 1,
          unitPriceMyr: 1950,
        },
        {
          serviceCategory: 'CoSec',
          description: 'Monthly Company Secretarial Retainer',
          deliverables: 'Statutory register maintenance, registered office & compliance calendar',
          frequency: 'Monthly',
          quantity: 1,
          unitPriceMyr: 85,
        },
        {
          serviceCategory: 'Accounting',
          description: 'Monthly Cloud Bookkeeping (Up to 80 Transactions)',
          deliverables: 'Bank reconciliation, P&L, Balance Sheet & quarterly management summary',
          frequency: 'Monthly',
          quantity: 1,
          unitPriceMyr: 550,
        },
      ],
      legal_remarks:
        'Incorporation fee includes SSM statutory registration fee of RM 1,010. Monthly retainers billed quarterly in advance. Excludes 8% SST where applicable.',
      assumptions:
        'All directors hold valid MyKad/passport KYC verification and submit source receipts by the 5th of each following month.',
      exclusions:
        'Employment Pass applications, local council (DBKL) premises licensing, and statutory audit fees.',
    },
    actor,
    orgConfig
  );

  await saveQuotationDraftOrSubmit(
    quote5,
    {
      scopeNotes: quote5.scopeNotes,
      legalRemarks: quote5.legalRemarks,
      assumptions: quote5.assumptions,
      exclusions: quote5.exclusions,
    },
    [],
    [],
    true,
    actor
  );

  if (actor.role === 'admin' || actor.role === 'approver') {
    await approveQuotation({ ...quote5, status: 'Pending Approval' }, actor);
  }
}
