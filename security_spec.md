# Security Specification — Meridian Advisory Ops

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied for both reads and writes.
2. **Verified Identity Mandate**: All non-public writes and private reads require `request.auth != null && request.auth.token.email_verified == true`.
3. **Self-Assigned Role Prevention**: A regular user creating `/users/{userId}` can only set `role == 'pic'` and can never mutate `role` during profile updates. Only System Administrators can promote users to `'approver'` or `'admin'`.
4. **PII Isolation**: `/users/{userId}` (containing staff email) is readable only by the owner (`request.auth.uid == userId`) or System Admins. `/leads/{leadId}` (containing client email/phone) is readable only by the assigned PIC, lead creator, designated Finance Approvers (`approverIds`), or System Admins.
5. **Orphan Prevention**: A `/quotations/{quotationId}` document cannot be created unless its referenced `/leads/{leadId}` exists. A `/quotations/{quotationId}/lineItems/{itemId}` document requires its parent `/quotations/{quotationId}` to exist and be editable (`Draft` or `Rejected`).
6. **Hard Managerial Approval Guardrail**: Quotations MUST be created with `isApproved == false` and `status in ['Draft', 'Pending Approval']`. Only Finance Approvers or System Admins can transition `isApproved` to `true`. Proposal dispatch (`status == 'Quotation Sent'`) is mathematically forbidden unless `existing().isApproved == true && existing().status == 'Approved'`.
7. **Terminal State Locking**: Once a quotation reaches `status == 'Quotation Sent'`, no further mutations are permitted except by System Admins.
8. **Immutable Audit Trail**: Documents in `/auditLogs/{logId}` can only be created with `actorUid == request.auth.uid` and `createdAt == request.time`; `update` and `delete` are unconditionally forbidden (`false`).
9. **Zero `get()`/`exists()` in `allow list`**: Every `allow list` rule evaluates solely `request.auth` and `resource.data` fields to prevent O(n) read amplification.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Escalation on Profile Create**: Non-admin user attempts `create` on `/users/{uid}` with `role: "admin"`.
2. **Privilege Escalation on Profile Update**: PIC user attempts `update` on `/users/{uid}` modifying `role` from `"pic"` to `"approver"`.
3. **PII Blanket Read**: PIC A attempts `get` on `/users/{picB_uid}` to harvest another staff member's email.
4. **Unassigned Lead PII Read**: PIC A attempts `get` on `/leads/{leadOwnedByPicB}` without being assigned PIC, creator, approver, or admin.
5. **Ghost / Shadow Field Injection**: Authenticated user attempts `create` on `/leads/{id}` with an undeclared field `isSuperVerified: true`.
6. **Pre-Approved Quotation Bypass**: PIC attempts `create` on `/quotations/{id}` with `isApproved: true, status: "Approved"`.
7. **PIC Self-Approval Attack**: Assigned PIC attempts `update` on `/quotations/{id}` setting `isApproved: true` while `status == "Pending Approval"`.
8. **Unapproved Dispatch Bypass (Step 8 Violation)**: Assigned PIC attempts `update` on `/quotations/{id}` setting `status: "Quotation Sent", dispatchChannel: "Email"` while `existing().isApproved == false`.
9. **Terminal State Tampering**: PIC attempts `update` on `/quotations/{id}` after `status == "Quotation Sent"` to alter `totalContractValueMyr`.
10. **Orphaned Quotation Creation**: User attempts `create` on `/quotations/{id}` referencing a non-existent `leadId: "nonexistent-lead-999"`.
11. **Audit Log Tampering / Deletion**: Even an admin attempts `update` or `delete` on `/auditLogs/{logId}` to erase approval history.
12. **ID Poisoning & Spoofed Timestamp**: User attempts `create` on `/leads/{150-char-invalid-id}` or passes a forged client `createdAt` timestamp not equal to `request.time`.
