import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'pic' | 'approver' | 'admin';

export type Department = 'CoSec' | 'Accounting' | 'Audit' | 'Tax' | 'Payroll';
export type UserDepartment = Department | 'Management';
export type ServiceCategory = Department | 'Advisory';

export type EntityType =
  | ''
  | 'Sdn Bhd'
  | 'Sole Prop'
  | 'LLP'
  | 'Partnership'
  | 'Bhd'
  | 'Labuan';

export type AccountingState =
  | ''
  | 'Up-to-date'
  | 'Backlog (1-6 months)'
  | 'Backlog (>6 months)'
  | 'New Incorporation';

export type ContactStatus =
  | 'Pending Contact'
  | 'Contacted'
  | 'Unreachable / Disqualified';

export type OutreachChannel = '' | 'Phone' | 'WhatsApp' | 'Email';
export type SlaStatus = 'Pending' | 'Compliant' | 'Breached';

export type WorkflowStage =
  | 'Triage'
  | 'Outreach'
  | 'Scope'
  | 'Quotation'
  | 'Approval'
  | 'Dispatched'
  | 'Disqualified';

export type QuotationStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Rejected'
  | 'Quotation Sent';

export type BillingFrequency = 'One-off' | 'Monthly' | 'Annual';
export type DispatchChannel = '' | 'Email' | 'WhatsApp' | 'Manual';

export type AuditAction =
  | 'LEAD_INGESTED'
  | 'OUTREACH_LOGGED'
  | 'SLA_ESCALATED'
  | 'SCOPE_RECORDED'
  | 'QUOTATION_GENERATED'
  | 'QUOTATION_SUBMITTED'
  | 'QUOTATION_APPROVED'
  | 'QUOTATION_REJECTED'
  | 'QUOTATION_DISPATCHED'
  | 'CONFIG_UPDATED';

export const DEPARTMENTS: Department[] = [
  'CoSec',
  'Accounting',
  'Audit',
  'Tax',
  'Payroll',
];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  CoSec: 'Company Secretarial',
  Accounting: 'Accounting & SST',
  Audit: 'Statutory Audit',
  Tax: 'Corporate & Personal Tax',
  Payroll: 'Payroll Processing',
};

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'CoSec',
  'Accounting',
  'Audit',
  'Tax',
  'Payroll',
  'Advisory',
];

export const ENTITY_TYPES: Exclude<EntityType, ''>[] = [
  'Sdn Bhd',
  'Sole Prop',
  'LLP',
  'Partnership',
  'Bhd',
  'Labuan',
];

export const ACCOUNTING_STATES: Exclude<AccountingState, ''>[] = [
  'Up-to-date',
  'Backlog (1-6 months)',
  'Backlog (>6 months)',
  'New Incorporation',
];

export const LIMITS = {
  leadCode: 30,
  emailSubject: 240,
  rawEmailBody: 10000,
  companyName: 255,
  contactPerson: 150,
  contactEmail: 150,
  contactPhone: 50,
  inquirySummary: 2000,
  assignedPicName: 120,
  outreachNotes: 2000,
  scopeNotes: 4000,
  legalRemarks: 4000,
  assumptions: 3000,
  exclusions: 3000,
  rejectionFeedback: 2000,
  lineDescription: 1000,
  lineDeliverables: 1000,
  auditDetails: 2000,
} as const;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  department: UserDepartment;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DepartmentPicEntry {
  uid: string;
  name: string;
  title: string;
}

export interface OrgConfig {
  slaWorkingDays: number;
  publicHolidays: string[];
  departmentPics: Record<Department, DepartmentPicEntry>;
  approverIds: string[];
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface Lead {
  id: string;
  leadCode: string;
  emailSubject: string;
  rawEmailBody: string;
  companyName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  inquirySummary: string;
  serviceLines: Department[];
  assignedDept: Department;
  assignedPicId: string;
  assignedPicName: string;
  createdBy: string;
  approverIds: string[];
  receivedAtIso: string;
  contactStatus: ContactStatus;
  firstContactAtIso: string;
  outreachChannel: OutreachChannel;
  outreachNotes: string;
  slaStatus: SlaStatus;
  escalationSentAtIso: string;
  escalationCount: number;
  scopeCompleted: boolean;
  entityType: EntityType;
  annualTurnoverMyr: number;
  monthlyBankTxCount: number;
  headcount: number;
  accountingState: AccountingState;
  sstRegistered: boolean;
  scopeNotes: string;
  workflowStage: WorkflowStage;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  leadId: string;
  companyName: string;
  assignedPicId: string;
  createdBy: string;
  approverIds: string[];
  scopeNotes: string;
  legalRemarks: string;
  assumptions: string;
  exclusions: string;
  totalSetupMyr: number;
  totalMonthlyMyr: number;
  totalAnnualMyr: number;
  totalContractValueMyr: number;
  status: QuotationStatus;
  isApproved: boolean;
  approvedBy: string;
  approvedByName: string;
  approvedAtIso: string;
  rejectionFeedback: string;
  dispatchChannel: DispatchChannel;
  dispatchedAtIso: string;
  dispatchedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface QuotationLineItem {
  id: string;
  quotationId: string;
  serviceCategory: ServiceCategory;
  description: string;
  deliverables: string;
  frequency: BillingFrequency;
  quantity: number;
  unitPriceMyr: number;
  lineTotalMyr: number;
  assignedPicId: string;
  createdBy: string;
  approverIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AuditLog {
  id: string;
  entityType: 'Lead' | 'Quotation' | 'Config';
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  actorUid: string;
  actorName: string;
  actorRole: string;
  details: string;
  assignedPicId: string;
  approverIds: string[];
  createdAt?: Timestamp;
}

export interface AiTriageResult {
  company_name: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  service_lines: Department[];
  primary_department: Department;
  inquiry_summary: string;
  inferred_entity_type: EntityType;
}

export interface AiQuotationLineInput {
  serviceCategory: ServiceCategory;
  description: string;
  deliverables: string;
  frequency: BillingFrequency;
  quantity: number;
  unitPriceMyr: number;
}

export interface AiQuotationResult {
  line_items: AiQuotationLineInput[];
  legal_remarks: string;
  assumptions: string;
  exclusions: string;
}
