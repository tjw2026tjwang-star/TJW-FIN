export type UserRole = 'Administrator' | 'Executive' | 'User';

export type AuditRole = 'administrator' | 'executive' | 'user';

export type Department = 'Co Sec' | 'Accounting' | 'Audit' | 'Tax' | 'Payroll' | 'Finance';

export type EntityType =
  | 'Sdn Bhd'
  | 'Enterprise'
  | 'LLP'
  | 'Unknown'
  | 'Sole Prop'
  | 'Bhd'
  | 'Other';

export type FinanceEngagementMode = 'Retainer' | 'Project';

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

export type QuotationStatus = 'Pending Approval' | 'Approved' | 'Dispatched' | 'Voided';

export type BillingFrequency = 'One-off' | 'Monthly' | 'Annual';

export type DispatchChannel = '' | 'Email' | 'WhatsApp';

export type AuditAction =
  | 'VIEW_PAGE'
  | 'TRIAGE_INBOUND_LEAD'
  | 'EDIT_LEAD_TRIAGE'
  | 'UPDATE_CONTACT_STATUS'
  | 'EDIT_CONTACT_STATUS'
  | 'LOG_SERVICE_SCOPE'
  | 'GENERATE_QUOTATION'
  | 'EDIT_QUOTATION_DRAFT'
  | 'AMEND_QUOTATION_VALIDITY'
  | 'APPROVE_QUOTATION'
  | 'DISPATCH_QUOTATION'
  | 'EXPORT_AUDIT_LOG'
  | 'SESSION_TIMEOUT_IDLE'
  | 'REQUEST_2FA_RESET'
  | 'DANGER_ZONE_2FA_OVERRIDE'
  | 'DANGER_ZONE_ARCHIVE_LEAD'
  | 'DANGER_ZONE_VOID_QUOTATION';

export const DEPARTMENTS: Department[] = [
  'Co Sec',
  'Accounting',
  'Audit',
  'Tax',
  'Payroll',
  'Finance',
];

export const DEPARTMENT_FULL_NAMES: Record<Department, string> = {
  'Co Sec': 'Company Secretarial',
  Accounting: 'Accounting & Bookkeeping',
  Audit: 'Statutory Audit',
  Tax: 'Corporate & Personal Tax',
  Payroll: 'Payroll Processing',
  Finance: 'Finance Advisory & FP&A',
};

export const ENTITY_TYPES: EntityType[] = [
  'Sdn Bhd',
  'Enterprise',
  'LLP',
  'Unknown',
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

export function normalizeSessionRole(department: Department, role: UserRole): UserRole {
  if (department !== 'Finance') return 'User';
  if (role === 'Administrator' || role === 'Executive' || role === 'User') {
    return role;
  }
  return 'User';
}

export function toAuditRole(role: UserRole): AuditRole {
  if (role === 'Administrator') return 'administrator';
  if (role === 'Executive') return 'executive';
  return 'user';
}

export function isAdministratorSession(session: UserSession | null | undefined): boolean {
  return Boolean(session && session.department === 'Finance' && session.role === 'Administrator');
}

export function canDraftQuotationSession(session: UserSession | null | undefined): boolean {
  return Boolean(
    session &&
      session.department === 'Finance' &&
      (session.role === 'Administrator' || session.role === 'Executive')
  );
}

export interface LeadScope {
  completed: boolean;
  turnoverTier: TurnoverTierId | '';
  annualTurnoverMyr: number;
  monthlyTransactionVolume: number;
  headcount: number;
  sstRegistered: boolean;
  requiresIncorporation: boolean;
  financeEngagementMode?: FinanceEngagementMode;
  accountingState: AccountingState;
  requestedServices: Department[];
  scopeNotes: string;
  updatedAt: string;
}

export interface AssistantLineItem {
  dept: Department;
  service_title: string;
  scope_summary: string;
  billing_cycle: 'One-off' | 'Monthly' | 'Annually';
  rate_myr: number;
}

export interface AuditEntry {
  log_id: string;
  timestamp: string; // ISO 8601 in Asia/Kuala_Lumpur (UTC+8)
  user_name: string;
  user_email: string;
  user_role: AuditRole;
  department: Department;
  page_visited: string;
  action_taken: AuditAction;
  target_id: string;
  action_details: string;
}

export type TwoFactorStatus = 'Enrolled' | 'Re-Enrollment Required';

export interface StaffSecurityProfile {
  email: string;
  name: string;
  department: Department;
  role: UserRole;
  twoFactorStatus: TwoFactorStatus;
  twoFactorMethod: string;
  twoFactorEnrolledAt: string;
  recoveryCodesRemaining: number;
  resetRequestPending: boolean;
  resetRequestReason: string;
  resetRequestedAt: string;
  lastResetBy: string;
  lastResetAt: string;
  lastSignedInAt: string;
}

export interface DangerZoneEvent {
  action_type: '2FA_OVERRIDE' | 'ARCHIVE_LEAD' | 'VOID_QUOTATION';
  target_user_email: string;
  approved_by_admin: string;
  status: 'APPROVED' | 'REJECTED';
  details: string;
}

export interface AssistantResponse {
  mode: 'LEAD_TRIAGE' | 'QUOTATION_GENERATION' | 'AUDIT_LOG_EVENT' | 'DANGER_ZONE_ACTION';
  lead_profile: {
    company_name: string;
    contact_person: string;
    contact_phone: string;
    contact_email: string;
    entity_type: 'Sdn Bhd' | 'Enterprise' | 'LLP' | 'Unknown';
  };
  routing: {
    primary_dept: Department;
    secondary_depts: Department[];
    sla_days_limit: number;
    routing_reason: string;
  };
  quotation: {
    validity_days: number;
    valid_until: string;
    line_items: AssistantLineItem[];
    total_setup_fee_myr: number;
    total_monthly_recurring_myr: number;
    total_annual_recurring_myr: number;
  };
  danger_zone_event: DangerZoneEvent;
  audit_event: AuditEntry;
  client_reply_draft: string;
}

export interface ValidityAmendment {
  amended_by: string;
  previous_validity: string;
  new_validity: string;
  amendment_timestamp: string;
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
  archived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
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
  validityDays: number;
  validUntil: string; // YYYY-MM-DD
  validityAmendments?: ValidityAmendment[];
  status: QuotationStatus;
  isApproved: boolean;
  approvedBy: string;
  approvedAt: string;
  dispatchChannel: DispatchChannel;
  dispatchedAt: string;
  dispatchedBy: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
