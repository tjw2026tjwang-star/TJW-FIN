/**
 * Phase 0 Payload-First Security TDD specification for Meridian Advisory Ops.
 * Validates the "Dirty Dozen" adversarial payloads against firestore.rules.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: { uid: string; email: string; email_verified: boolean; role: string };
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  blockingRule: string;
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    id: 1,
    name: 'Self-Escalation on Profile Create',
    operation: 'create',
    path: '/users/pic_user_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { uid: 'pic_user_1', email: 'pic1@firm.my', displayName: 'PIC 1', role: 'admin', department: 'CoSec' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: "incoming().role == 'pic' || isBootstrappedAdmin()"
  },
  {
    id: 2,
    name: 'Privilege Escalation on Profile Update',
    operation: 'update',
    path: '/users/pic_user_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { role: 'approver' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: "incoming().role == existing().role && affectedKeys().hasOnly(['displayName', 'department', 'updatedAt'])"
  },
  {
    id: 3,
    name: 'PII Blanket Read on Another Staff Member',
    operation: 'get',
    path: '/users/pic_user_2',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'request.auth.uid == userId || isAdmin()'
  },
  {
    id: 4,
    name: 'Unassigned Lead PII Read',
    operation: 'get',
    path: '/leads/lead_assigned_to_pic2',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'existing().assignedPicId == request.auth.uid || existing().createdBy == request.auth.uid || isApprover() || isAdmin()'
  },
  {
    id: 5,
    name: 'Shadow / Ghost Field Injection on Lead Create',
    operation: 'create',
    path: '/leads/lead_shadow_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { companyName: 'Acme Sdn Bhd', isSuperVerified: true },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'isValidLead(incoming()) strict keys().hasOnly(...)'
  },
  {
    id: 6,
    name: 'Pre-Approved Quotation Creation Bypass',
    operation: 'create',
    path: '/quotations/quote_bypass_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { isApproved: true, status: 'Approved' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: "incoming().isApproved == false && incoming().status in ['Draft', 'Pending Approval']"
  },
  {
    id: 7,
    name: 'PIC Self-Approval Attack on Pending Quotation',
    operation: 'update',
    path: '/quotations/quote_pending_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { isApproved: true, status: 'Approved', approvedBy: 'pic_user_1' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'isApprover() gate on Approval Action'
  },
  {
    id: 8,
    name: 'Unapproved Proposal Dispatch Bypass (Step 8 Guardrail)',
    operation: 'update',
    path: '/quotations/quote_unapproved_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { status: 'Quotation Sent', dispatchChannel: 'Email', dispatchedAtIso: '2026-11-19T09:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: "existing().isApproved == true && existing().status == 'Approved'"
  },
  {
    id: 9,
    name: 'Terminal State Tampering After Quotation Sent',
    operation: 'update',
    path: '/quotations/quote_sent_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { totalContractValueMyr: 100 },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: "existing().status != 'Quotation Sent' || isAdmin()"
  },
  {
    id: 10,
    name: 'Orphaned Quotation Referencing Non-Existent Lead',
    operation: 'create',
    path: '/quotations/quote_orphan_1',
    actor: { uid: 'pic_user_1', email: 'pic1@firm.my', email_verified: true, role: 'pic' },
    payload: { leadId: 'nonexistent-lead-999', isApproved: false, status: 'Draft' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'exists(/databases/$(database)/documents/leads/$(incoming().leadId))'
  },
  {
    id: 11,
    name: 'Immutable Audit Log Modification or Deletion',
    operation: 'delete',
    path: '/auditLogs/log_approval_1',
    actor: { uid: 'admin_1', email: 'tjw2026tjwang@gmail.com', email_verified: true, role: 'admin' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'allow update: if false; allow delete: if false;'
  },
  {
    id: 12,
    name: 'ID Poisoning & Unverified Email Spoof',
    operation: 'create',
    path: '/leads/invalid$$id$$with$$symbols',
    actor: { uid: 'spoof_1', email: 'tjw2026tjwang@gmail.com', email_verified: false, role: 'pic' },
    payload: { companyName: 'Spoof Corp' },
    expectedResult: 'PERMISSION_DENIED',
    blockingRule: 'isVerifiedUser() && isValidId(leadId)'
  }
];
