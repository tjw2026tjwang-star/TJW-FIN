export type UserRole = 'Administrator' | 'User';

export type Department = 'Co Sec' | 'Accounting' | 'Audit' | 'Tax' | 'Payroll';

export type EntityType = 'Sdn Bhd' | 'Enterprise' | 'LLP' | 'Sole Prop' | 'Bhd' | 'Other';

export type ContactStatus = 'Pending Contact' | 'Contacted' | 'Unreachable';

export type OutreachChannel = '' | 'Phone' | 'WhatsApp' | 'Email';

export type AccountingState =
  | ''
  | 'Up-to-date'
  | 'Backlog (1-6 months)'
  | 'Backlog (>6 months)'
  | 'New Incorporation';

export type WorkflowStage =
  | 'Triage'
  | 'Outreach'
  | 'Scope'
  | 'Quotation'
  | 'Approval'
  | 'Dispatched'
  | 'Unreachable';

export type QuotationStatus = 'Pending Approval' | 'Approved' | 'Dispatched';

export type BillingFrequency = 'One-off' | 'Monthly' | 'Annual';

export type DispatchChannel = '' | 'Email' | 'WhatsApp';

export type AuditAction =
  | 'SESSION_STARTED'
  | 'LEAD_CREATED'
  | 'OUTREACH_UPDATED'
  | 'SLA_REMINDER_LOGGED'
  | 'SCOPE_LOGGED'
  | 'QUOTATION_GENERATED'
  | 'QUOTATION_UPDATED'
  | 'QUOTATION_APPROVED'
  | 'QUOTATION_APPROVAL_REVOKED'
  | 'QUOTATION_DISPATCHED';

export const DEPARTMENTS: Department[] = [
  'Co Sec',
  'Accounting',
  'Audit',
  'Tax',
  'Payroll',
];

export const DEPARTMENT_FULL_NAMES: Record<Department, string> = {
  'Co Sec': 'Company Secretarial',
  Accounting: 'Accounting & Bookkeeping',
  Audit: 'Statutory Audit',
  Tax: 'Corporate & Personal Tax',
  Payroll: 'Payroll Processing',
};

export const ENTITY_TYPES: EntityType[] = [
  'Sdn Bhd',
  'Enterprise',
  'LLP',
  'Sole Prop',
  'Bhd',
  'Other',
];

export const ACCOUNTING_STATES: Exclude<AccountingState, ''>[] = [
  'Up-to-date',
  'Backlog (1-6 months)',
  'Backlog (>6 months)',
  'New Incorporation',
];

export const TURNOVER_TIERS = [
  { id: 'under_500k', label: 'Below RM 500,000', numericValue: 350000 },
  { id: '500k_2m', label: 'RM 500,000 – RM 2,000,000', numericValue: 1250000 },
  { id: '2m_5m', label: 'RM 2,000,000 – RM 5,000,000', numericValue: 3500000 },
  { id: '5m_15m', label: 'RM 5,000,000 – RM 15,000,000', numericValue: 9000000 },
  { id: 'above_15m', label: 'Above RM 15,000,000', numericValue: 20000000 },
] as const;

export type TurnoverTierId = (typeof TURNOVER_TIERS)[number]['id'];

export interface UserSession {
  name: string;
  email: string;
  department: Department;
  role: UserRole;
  signedInAt: string;
}

export interface LeadScope {
  completed: boolean;
  turnoverTier: TurnoverTierId | '';
  annualTurnoverMyr: number;
  monthlyTransactionVolume: number;
  headcount: number;
  sstRegistered: boolean;
  requiresIncorporation: boolean;
  accountingState: AccountingState;
  requestedServices: Department[];
  scopeNotes: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  leadCode: string;
  companyName: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  entityType: EntityType;
  inquiryNotes: string;
  targetDept: Department;
  secondaryDepts: Department[];
  assignedPicName: string;
  receivedAt: string; // Step 2 assignment timestamp (ISO)
  contactStatus: ContactStatus; // Step 3: Pending Contact | Contacted | Unreachable
  firstContactAt: string; // Frozen SLA timestamp once Contacted
  outreachChannel: OutreachChannel;
  outreachNotes: string;
  escalationRemindersSent: number;
  lastReminderAt: string;
  scope: LeadScope;
  workflowStage: WorkflowStage;
  createdByName: string;
  updatedAt: string;
}

export interface QuotationLineItem {
  id: string;
  dept: Department;
  description: string;
  deliverables: string;
  frequency: BillingFrequency;
  quantity: number;
  unitPriceMyr: number;
  lineTotalMyr: number;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  leadId: string;
  companyName: string;
  targetDept: Department;
  lineItems: QuotationLineItem[];
  totalSetupFeeMyr: number;
  totalMonthlyRecurringMyr: number;
  totalAnnualRecurringMyr: number;
  totalYearOneMyr: number;
  legalRemarks: string;
  assumptions: string;
  exclusions: string;
  status: QuotationStatus;
  isApproved: boolean;
  approvedBy: string;
  approvedAt: string;
  dispatchChannel: DispatchChannel;
  dispatchedAt: string;
  dispatchedBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole;
  department: Department;
  action: AuditAction;
  entityRef: string;
  details: string;
}
