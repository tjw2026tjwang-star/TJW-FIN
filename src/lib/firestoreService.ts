import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  buildDefaultOrgConfig,
  computeQuotationTotals,
  evaluateLeadSla,
  generateLeadCode,
  generateQuoteNumber,
  generateSafeId,
} from './sla';
import {
  LIMITS,
  type AccountingState,
  type AiQuotationLineInput,
  type AiQuotationResult,
  type AuditAction,
  type ContactStatus,
  type Department,
  type DispatchChannel,
  type EntityType,
  type Lead,
  type OrgConfig,
  type OutreachChannel,
  type Quotation,
  type QuotationLineItem,
  type UserProfile,
  type WorkflowStage,
} from '../types';

function clampStr(val: string | undefined | null, max: number): string {
  return (val ?? '').trim().slice(0, max);
}

function clampNonNegInt(val: number | undefined | null, max: number): number {
  const n = Math.floor(Number(val) || 0);
  return Math.max(0, Math.min(max, n));
}

function clampNonNegNum(val: number | undefined | null, max: number): number {
  const n = Number(val) || 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100));
}

export async function ensureUserProfile(firebaseUser: User): Promise<UserProfile> {
  const path = `users/${firebaseUser.uid}`;
  const ref = doc(db, 'users', firebaseUser.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const isBootstrapAdmin =
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
      firebaseUser.emailVerified;

    const newProfile = {
      uid: firebaseUser.uid,
      email: clampStr(firebaseUser.email, 150) || 'user@meridian.my',
      displayName: clampStr(firebaseUser.displayName || firebaseUser.email?.split('@')[0], 120) || 'Team Member',
      role: isBootstrapAdmin ? ('admin' as const) : ('pic' as const),
      department: isBootstrapAdmin ? ('Management' as const) : ('CoSec' as const),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, newProfile);
    return {
      uid: newProfile.uid,
      email: newProfile.email,
      displayName: newProfile.displayName,
      role: newProfile.role,
      department: newProfile.department,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadOrgConfig(profile: UserProfile): Promise<OrgConfig> {
  const path = 'settings/org_config';
  const ref = doc(db, 'settings', 'org_config');
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as OrgConfig;
    }
    const defaults = buildDefaultOrgConfig(profile.uid, profile.displayName);
    if (profile.role === 'admin') {
      await setDoc(ref, {
        ...defaults,
        updatedBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
    }
    return defaults;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveOrgConfig(
  config: Omit<OrgConfig, 'updatedAt' | 'updatedBy'>,
  actor: UserProfile
): Promise<void> {
  const path = 'settings/org_config';
  const ref = doc(db, 'settings', 'org_config');
  try {
    const sanitized = {
      slaWorkingDays: Math.max(1, Math.min(30, Math.floor(Number(config.slaWorkingDays) || 4))),
      publicHolidays: config.publicHolidays
        .map((d) => clampStr(d, 20))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .slice(0, 50),
      departmentPics: config.departmentPics,
      approverIds: Array.from(new Set(config.approverIds.filter(Boolean))).slice(0, 10),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, sanitized, { merge: false });
    await recordAuditLog({
      entityType: 'Config',
      entityId: 'org_config',
      entityLabel: 'Organization Operations Policy',
      action: 'CONFIG_UPDATED',
      actor,
      details: `Updated SLA threshold to ${sanitized.slaWorkingDays} working days and ${sanitized.publicHolidays.length} public holidays.`,
      assignedPicId: actor.uid,
      approverIds: sanitized.approverIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function recordAuditLog(params: {
  entityType: 'Lead' | 'Quotation' | 'Config';
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  actor: UserProfile;
  details: string;
  assignedPicId: string;
  approverIds: string[];
}): Promise<void> {
  const logId = generateSafeId('log');
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      entityType: params.entityType,
      entityId: clampStr(params.entityId, 128),
      entityLabel: clampStr(params.entityLabel, 160) || 'Operations Record',
      action: params.action,
      actorUid: params.actor.uid,
      actorName: clampStr(params.actor.displayName, 120) || 'Staff User',
      actorRole: clampStr(params.actor.role, 40) || 'pic',
      details: clampStr(params.details, LIMITS.auditDetails) || 'Action recorded',
      assignedPicId: clampStr(params.assignedPicId, 128),
      approverIds: Array.from(new Set(params.approverIds.filter(Boolean))).slice(0, 10),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface CreateLeadPayload {
  emailSubject: string;
  rawEmailBody: string;
  companyName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  inquirySummary: string;
  serviceLines: Department[];
  assignedDept: Department;
  entityType?: EntityType;
  receivedAtIso?: string;
}

export async function createLeadFromTriage(
  payload: CreateLeadPayload,
  actor: UserProfile,
  orgConfig: OrgConfig
): Promise<Lead> {
  const leadId = generateSafeId('lead');
  const path = `leads/${leadId}`;
  const leadCode = generateLeadCode();
  const picEntry = orgConfig.departmentPics[payload.assignedDept];
  const assignedPicId = picEntry?.uid || actor.uid;
  const assignedPicName = clampStr(picEntry?.name || actor.displayName, LIMITS.assignedPicName);
  const approverIds = Array.from(new Set([...(orgConfig.approverIds || []), actor.uid])).slice(0, 10);
  const safeServiceLines: Department[] =
    payload.serviceLines.length > 0 ? Array.from(new Set(payload.serviceLines)).slice(0, 5) : [payload.assignedDept];

  const receivedAtIso = clampStr(payload.receivedAtIso || new Date().toISOString(), 40);

  const docData = {
    leadCode,
    emailSubject: clampStr(payload.emailSubject, LIMITS.emailSubject),
    rawEmailBody: clampStr(payload.rawEmailBody, LIMITS.rawEmailBody),
    companyName: clampStr(payload.companyName, LIMITS.companyName) || 'Prospective Client',
    contactPerson: clampStr(payload.contactPerson, LIMITS.contactPerson) || 'Prospective Director',
    contactEmail: clampStr(payload.contactEmail, LIMITS.contactEmail),
    contactPhone: clampStr(payload.contactPhone, LIMITS.contactPhone),
    inquirySummary: clampStr(payload.inquirySummary, LIMITS.inquirySummary),
    serviceLines: safeServiceLines,
    assignedDept: payload.assignedDept,
    assignedPicId,
    assignedPicName,
    createdBy: actor.uid,
    approverIds,
    receivedAtIso,
    contactStatus: 'Pending Contact' as ContactStatus,
    firstContactAtIso: '',
    outreachChannel: '' as OutreachChannel,
    outreachNotes: '',
    slaStatus: 'Pending' as const,
    escalationSentAtIso: '',
    escalationCount: 0,
    scopeCompleted: false,
    entityType: (payload.entityType || '') as EntityType,
    annualTurnoverMyr: 0,
    monthlyBankTxCount: 0,
    headcount: 0,
    accountingState: '' as AccountingState,
    sstRegistered: false,
    scopeNotes: '',
    workflowStage: 'Outreach' as WorkflowStage,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'leads', leadId), docData);
    await recordAuditLog({
      entityType: 'Lead',
      entityId: leadId,
      entityLabel: `${leadCode} · ${docData.companyName}`,
      action: 'LEAD_INGESTED',
      actor,
      details: `Ingested inbound email and routed to ${payload.assignedDept} PIC (${assignedPicName}). Services: ${safeServiceLines.join(', ')}.`,
      assignedPicId,
      approverIds,
    });
    return { id: leadId, ...docData, createdAt: undefined, updatedAt: undefined };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function logOutreachAndStatus(
  lead: Lead,
  updates: {
    contactStatus: ContactStatus;
    outreachChannel: OutreachChannel;
    outreachNotes: string;
  },
  actor: UserProfile,
  orgConfig: OrgConfig
): Promise<void> {
  const path = `leads/${lead.id}`;
  const nowIso = new Date().toISOString();
  const firstContactAtIso =
    updates.contactStatus === 'Contacted'
      ? lead.firstContactAtIso || nowIso
      : lead.firstContactAtIso;

  const evalLead: Lead = {
    ...lead,
    contactStatus: updates.contactStatus,
    firstContactAtIso,
  };
  const slaEval = evaluateLeadSla(evalLead, orgConfig.slaWorkingDays, orgConfig.publicHolidays);
  const slaStatus =
    updates.contactStatus === 'Contacted'
      ? slaEval.isBreached
        ? 'Breached'
        : 'Compliant'
      : slaEval.isBreached
        ? 'Breached'
        : 'Pending';

  const workflowStage: WorkflowStage =
    updates.contactStatus === 'Contacted'
      ? lead.scopeCompleted
        ? lead.workflowStage === 'Outreach' || lead.workflowStage === 'Triage'
          ? 'Scope'
          : lead.workflowStage
        : 'Scope'
      : updates.contactStatus === 'Unreachable / Disqualified'
        ? 'Disqualified'
        : 'Outreach';

  try {
    await updateDoc(doc(db, 'leads', lead.id), {
      contactStatus: updates.contactStatus,
      firstContactAtIso: clampStr(firstContactAtIso, 40),
      outreachChannel: updates.outreachChannel,
      outreachNotes: clampStr(updates.outreachNotes, LIMITS.outreachNotes),
      slaStatus,
      workflowStage,
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      entityType: 'Lead',
      entityId: lead.id,
      entityLabel: `${lead.leadCode} · ${lead.companyName}`,
      action: 'OUTREACH_LOGGED',
      actor,
      details: `Updated contact status to "${updates.contactStatus}" via ${updates.outreachChannel || 'Direct'}. SLA status: ${slaStatus} (${slaEval.workingDaysElapsed} working days).`,
      assignedPicId: lead.assignedPicId,
      approverIds: lead.approverIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveLeadScope(
  lead: Lead,
  scope: {
    entityType: EntityType;
    annualTurnoverMyr: number;
    monthlyBankTxCount: number;
    headcount: number;
    accountingState: AccountingState;
    sstRegistered: boolean;
    serviceLines: Department[];
    scopeNotes: string;
  },
  actor: UserProfile
): Promise<void> {
  const path = `leads/${lead.id}`;
  const safeServices: Department[] =
    scope.serviceLines.length > 0 ? Array.from(new Set(scope.serviceLines)).slice(0, 5) : lead.serviceLines;

  try {
    await updateDoc(doc(db, 'leads', lead.id), {
      scopeCompleted: true,
      entityType: scope.entityType,
      annualTurnoverMyr: clampNonNegNum(scope.annualTurnoverMyr, 10000000000),
      monthlyBankTxCount: clampNonNegInt(scope.monthlyBankTxCount, 1000000),
      headcount: clampNonNegInt(scope.headcount, 100000),
      accountingState: scope.accountingState,
      sstRegistered: Boolean(scope.sstRegistered),
      serviceLines: safeServices,
      scopeNotes: clampStr(scope.scopeNotes, LIMITS.scopeNotes),
      workflowStage:
        lead.workflowStage === 'Triage' || lead.workflowStage === 'Outreach' || lead.workflowStage === 'Scope'
          ? 'Quotation'
          : lead.workflowStage,
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      entityType: 'Lead',
      entityId: lead.id,
      entityLabel: `${lead.leadCode} · ${lead.companyName}`,
      action: 'SCOPE_RECORDED',
      actor,
      details: `Recorded verified discovery scope (${scope.entityType || 'Entity'}, Turnover RM ${Number(scope.annualTurnoverMyr || 0).toLocaleString('en-MY')}, ${scope.headcount} staff, SST: ${scope.sstRegistered ? 'Yes' : 'No'}).`,
      assignedPicId: lead.assignedPicId,
      approverIds: lead.approverIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function runSlaEscalationSweep(
  leads: Lead[],
  actor: UserProfile,
  orgConfig: OrgConfig
): Promise<number> {
  const nowIso = new Date().toISOString();
  let escalatedCount = 0;

  for (const lead of leads) {
    if (lead.contactStatus !== 'Pending Contact') continue;
    const evaluation = evaluateLeadSla(lead, orgConfig.slaWorkingDays, orgConfig.publicHolidays);
    if (!evaluation.isBreached) continue;

    const path = `leads/${lead.id}`;
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        slaStatus: 'Breached',
        escalationSentAtIso: nowIso,
        escalationCount: Math.min(100, (lead.escalationCount || 0) + 1),
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        entityType: 'Lead',
        entityId: lead.id,
        entityLabel: `${lead.leadCode} · ${lead.companyName}`,
        action: 'SLA_ESCALATED',
        actor,
        details: `09:00 AM SLA sweep triggered escalation #${(lead.escalationCount || 0) + 1} (${evaluation.workingDaysElapsed} working days uncontacted; threshold ${orgConfig.slaWorkingDays}d). Reminder dispatched to ${lead.assignedPicName} with CC to Finance Manager.`,
        assignedPicId: lead.assignedPicId,
        approverIds: lead.approverIds,
      });

      escalatedCount += 1;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  return escalatedCount;
}

export async function createQuotationWithItems(
  lead: Lead,
  aiResult: AiQuotationResult,
  actor: UserProfile,
  orgConfig: OrgConfig
): Promise<Quotation> {
  const quotationId = generateSafeId('quote');
  const quoteNumber = generateQuoteNumber();
  const path = `quotations/${quotationId}`;
  const approverIds = Array.from(
    new Set([...(lead.approverIds || []), ...(orgConfig.approverIds || []), actor.uid])
  ).slice(0, 10);

  const normalizedItems = (aiResult.line_items || []).slice(0, 30).map((item) => {
    const qty = Math.max(1, clampNonNegInt(item.quantity, 10000));
    const unit = clampNonNegNum(item.unitPriceMyr, 10000000);
    return {
      serviceCategory: item.serviceCategory,
      description: clampStr(item.description, LIMITS.lineDescription) || 'Corporate Advisory Service',
      deliverables: clampStr(item.deliverables, LIMITS.lineDeliverables),
      frequency: item.frequency,
      quantity: qty,
      unitPriceMyr: unit,
      lineTotalMyr: Math.round(qty * unit * 100) / 100,
    };
  });

  const totals = computeQuotationTotals(normalizedItems);

  const quoteDoc = {
    quoteNumber,
    leadId: lead.id,
    companyName: clampStr(lead.companyName, LIMITS.companyName),
    assignedPicId: lead.assignedPicId,
    createdBy: actor.uid,
    approverIds,
    scopeNotes: clampStr(lead.scopeNotes || lead.inquirySummary, LIMITS.scopeNotes),
    legalRemarks: clampStr(aiResult.legal_remarks, LIMITS.legalRemarks),
    assumptions: clampStr(aiResult.assumptions, LIMITS.assumptions),
    exclusions: clampStr(aiResult.exclusions, LIMITS.exclusions),
    totalSetupMyr: totals.totalSetupMyr,
    totalMonthlyMyr: totals.totalMonthlyMyr,
    totalAnnualMyr: totals.totalAnnualMyr,
    totalContractValueMyr: totals.totalContractValueMyr,
    status: 'Draft' as const,
    isApproved: false,
    approvedBy: '',
    approvedByName: '',
    approvedAtIso: '',
    rejectionFeedback: '',
    dispatchChannel: '' as DispatchChannel,
    dispatchedAtIso: '',
    dispatchedBy: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    // 1. Create parent quotation first so Master Gate exists() succeeds for subcollection items
    await setDoc(doc(db, 'quotations', quotationId), quoteDoc);

    // 2. Write line items to subcollection
    const batch = writeBatch(db);
    for (const item of normalizedItems) {
      const itemId = generateSafeId('li');
      batch.set(doc(db, 'quotations', quotationId, 'lineItems', itemId), {
        quotationId,
        serviceCategory: item.serviceCategory,
        description: item.description,
        deliverables: item.deliverables,
        frequency: item.frequency,
        quantity: item.quantity,
        unitPriceMyr: item.unitPriceMyr,
        lineTotalMyr: item.lineTotalMyr,
        assignedPicId: lead.assignedPicId,
        createdBy: actor.uid,
        approverIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    // 3. Sync lead workflow stage
    await updateDoc(doc(db, 'leads', lead.id), {
      workflowStage: 'Quotation',
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      entityType: 'Quotation',
      entityId: quotationId,
      entityLabel: `${quoteNumber} · ${lead.companyName}`,
      action: 'QUOTATION_GENERATED',
      actor,
      details: `Generated AI quotation with ${normalizedItems.length} line items. Est. Year-1 Contract Value: RM ${totals.totalContractValueMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 })}.`,
      assignedPicId: lead.assignedPicId,
      approverIds,
    });

    return { id: quotationId, ...quoteDoc, createdAt: undefined, updatedAt: undefined };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchQuotationLineItems(
  quotationId: string,
  profile: UserProfile
): Promise<QuotationLineItem[]> {
  const path = `quotations/${quotationId}/lineItems`;
  try {
    const colRef = collection(db, 'quotations', quotationId, 'lineItems');
    const isBootstrapAdmin =
      profile.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

    const q = isBootstrapAdmin
      ? query(colRef)
      : profile.role === 'approver' || profile.role === 'admin'
        ? query(colRef, where('approverIds', 'array-contains', profile.uid))
        : query(colRef, where('assignedPicId', '==', profile.uid));

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<QuotationLineItem, 'id'>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface EditableLineItem extends AiQuotationLineInput {
  id?: string;
}

export async function saveQuotationDraftOrSubmit(
  quotation: Quotation,
  updates: {
    scopeNotes: string;
    legalRemarks: string;
    assumptions: string;
    exclusions: string;
  },
  items: EditableLineItem[],
  deletedIds: string[],
  submitForApproval: boolean,
  actor: UserProfile
): Promise<void> {
  const path = `quotations/${quotation.id}`;

  const normalized = items.map((item) => {
    const qty = Math.max(1, clampNonNegInt(item.quantity, 10000));
    const unit = clampNonNegNum(item.unitPriceMyr, 10000000);
    return {
      ...item,
      description: clampStr(item.description, LIMITS.lineDescription) || 'Advisory Fee',
      deliverables: clampStr(item.deliverables, LIMITS.lineDeliverables),
      quantity: qty,
      unitPriceMyr: unit,
      lineTotalMyr: Math.round(qty * unit * 100) / 100,
    };
  });

  const totals = computeQuotationTotals(normalized);

  try {
    // 1. Update line items while parent quotation is still in Draft/Rejected state
    const batch = writeBatch(db);
    for (const delId of deletedIds) {
      batch.delete(doc(db, 'quotations', quotation.id, 'lineItems', delId));
    }
    for (const item of normalized) {
      if (item.id) {
        batch.update(doc(db, 'quotations', quotation.id, 'lineItems', item.id), {
          serviceCategory: item.serviceCategory,
          description: item.description,
          deliverables: item.deliverables,
          frequency: item.frequency,
          quantity: item.quantity,
          unitPriceMyr: item.unitPriceMyr,
          lineTotalMyr: item.lineTotalMyr,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newId = generateSafeId('li');
        batch.set(doc(db, 'quotations', quotation.id, 'lineItems', newId), {
          quotationId: quotation.id,
          serviceCategory: item.serviceCategory,
          description: item.description,
          deliverables: item.deliverables,
          frequency: item.frequency,
          quantity: item.quantity,
          unitPriceMyr: item.unitPriceMyr,
          lineTotalMyr: item.lineTotalMyr,
          assignedPicId: quotation.assignedPicId,
          createdBy: actor.uid,
          approverIds: quotation.approverIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();

    // 2. Update parent quotation totals & optional status transition to Pending Approval
    const nextStatus = submitForApproval ? 'Pending Approval' : 'Draft';
    await updateDoc(doc(db, 'quotations', quotation.id), {
      scopeNotes: clampStr(updates.scopeNotes, LIMITS.scopeNotes),
      legalRemarks: clampStr(updates.legalRemarks, LIMITS.legalRemarks),
      assumptions: clampStr(updates.assumptions, LIMITS.assumptions),
      exclusions: clampStr(updates.exclusions, LIMITS.exclusions),
      totalSetupMyr: totals.totalSetupMyr,
      totalMonthlyMyr: totals.totalMonthlyMyr,
      totalAnnualMyr: totals.totalAnnualMyr,
      totalContractValueMyr: totals.totalContractValueMyr,
      status: nextStatus,
      rejectionFeedback: submitForApproval ? '' : quotation.rejectionFeedback,
      updatedAt: serverTimestamp(),
    });

    if (submitForApproval) {
      await updateDoc(doc(db, 'leads', quotation.leadId), {
        workflowStage: 'Approval',
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        entityType: 'Quotation',
        entityId: quotation.id,
        entityLabel: `${quotation.quoteNumber} · ${quotation.companyName}`,
        action: 'QUOTATION_SUBMITTED',
        actor,
        details: `Submitted quotation to Finance Approval Queue. Est. Year-1 Total: RM ${totals.totalContractValueMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 })}.`,
        assignedPicId: quotation.assignedPicId,
        approverIds: quotation.approverIds,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function approveQuotation(
  quotation: Quotation,
  actor: UserProfile
): Promise<void> {
  const path = `quotations/${quotation.id}`;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'quotations', quotation.id), {
      isApproved: true,
      approvedBy: actor.uid,
      approvedByName: clampStr(actor.displayName, 120) || 'Finance Director',
      approvedAtIso: nowIso,
      status: 'Approved',
      rejectionFeedback: '',
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      entityType: 'Quotation',
      entityId: quotation.id,
      entityLabel: `${quotation.quoteNumber} · ${quotation.companyName}`,
      action: 'QUOTATION_APPROVED',
      actor,
      details: `Finance approval gate PASSED by ${actor.displayName}. Client proposal dispatch unlocked (Year-1 Value: RM ${quotation.totalContractValueMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 })}).`,
      assignedPicId: quotation.assignedPicId,
      approverIds: quotation.approverIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function rejectQuotation(
  quotation: Quotation,
  feedback: string,
  actor: UserProfile
): Promise<void> {
  const path = `quotations/${quotation.id}`;
  const cleanFeedback = clampStr(feedback, LIMITS.rejectionFeedback);
  if (!cleanFeedback) {
    throw new Error('Rejection feedback is required.');
  }

  try {
    await updateDoc(doc(db, 'quotations', quotation.id), {
      isApproved: false,
      approvedBy: '',
      approvedByName: '',
      approvedAtIso: '',
      status: 'Rejected',
      rejectionFeedback: cleanFeedback,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'leads', quotation.leadId), {
      workflowStage: 'Quotation',
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      entityType: 'Quotation',
      entityId: quotation.id,
      entityLabel: `${quotation.quoteNumber} · ${quotation.companyName}`,
      action: 'QUOTATION_REJECTED',
      actor,
      details: `Quotation returned to PIC for revision. Feedback: ${cleanFeedback}`,
      assignedPicId: quotation.assignedPicId,
      approverIds: quotation.approverIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function dispatchQuotation(
  quotation: Quotation,
  channel: Exclude<DispatchChannel, ''>,
  actor: UserProfile
): Promise<void> {
  if (!quotation.isApproved || quotation.status !== 'Approved') {
    throw new Error('Hard Guardrail: Quotation cannot be dispatched without Finance Approval.');
  }

  const path = `quotations/${quotation.id}`;
  const nowIso = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'quotations', quotation.id), {
      status: 'Quotation Sent',
      dispatchChannel: channel,
      dispatchedAtIso: nowIso,
      dispatchedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'leads', quotation.leadId), {
      workflowStage: 'Dispatched',
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      entityType: 'Quotation',
      entityId: quotation.id,
      entityLabel: `${quotation.quoteNumber} · ${quotation.companyName}`,
      action: 'QUOTATION_DISPATCHED',
      actor,
      details: `Dispatched approved client proposal via ${channel} at ${nowIso}.`,
      assignedPicId: quotation.assignedPicId,
      approverIds: quotation.approverIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
