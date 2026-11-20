import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  LogOut,
  Plus,
  Search,
} from 'lucide-react';
import {
  DEPARTMENTS,
  type AssistantResponse,
  type AuditAction,
  type AuditEntry,
  type BillingFrequency,
  type ContactStatus,
  type Department,
  type DispatchChannel,
  type Lead,
  type LeadScope,
  type OutreachChannel,
  type Quotation,
  type QuotationLineItem,
  type UserSession,
  type WorkflowStage,
} from './types';
import {
  loadAuditLog,
  loadLeads,
  loadQuotations,
  loadSession,
  saveAuditLog,
  saveLeads,
  saveQuotations,
  saveSession,
} from './lib/storage';
import {
  computeValidUntilDate,
  DEFAULT_VALIDITY_DAYS,
  evaluateLeadSla,
  formatDateShort,
  formatKualaLumpurIso,
  formatMyr,
  formatValiditySummary,
  generateAuditLogId,
  generateLeadCode,
  generateQuoteNumber,
  generateSafeId,
} from './lib/sla';
import {
  buildBaselineQuotationItems,
  computeQuotationTotals,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_EXCLUSIONS,
  DEFAULT_LEGAL_REMARKS,
} from './lib/pricing';
import { BrandLogo } from './components/BrandLogo';
import { SessionGate } from './components/SessionGate';
import { InboundTriageModal, type NewLeadInput } from './components/InboundTriageModal';
import { LeadDetailDrawer, type EditLeadTriagePayload } from './components/LeadDetailDrawer';
import { QuotationWorkbench } from './components/QuotationWorkbench';
import { AuditLogView } from './components/AuditLogView';
import { AssistantWorkbench } from './components/AssistantWorkbench';

type ActiveScreen = 'leads' | 'quotations' | 'assistant' | 'audit';

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => loadSession());
  const [leads, setLeads] = useState<Lead[]>(() => loadLeads());
  const [quotations, setQuotations] = useState<Quotation[]>(() => loadQuotations());
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() => loadAuditLog());

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('leads');
  const [activeDeptFilter, setActiveDeptFilter] = useState<'ALL' | Department>('ALL');
  const [contactFilter, setContactFilter] = useState<'ALL' | ContactStatus | 'SLA_BREACH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [triageModalOpen, setTriageModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drawerOpenInTriageEdit, setDrawerOpenInTriageEdit] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);

  // Persist reactively to LocalStorage
  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    saveLeads(leads);
  }, [leads]);

  useEffect(() => {
    saveQuotations(quotations);
  }, [quotations]);

  useEffect(() => {
    saveAuditLog(auditEntries);
  }, [auditEntries]);

  const syncAuditLogsFromServer = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      if (!res.ok) return;
      const data = (await res.json()) as { logs?: AuditEntry[] };
      if (!Array.isArray(data.logs) || data.logs.length === 0) return;
      setAuditEntries((prev) => {
        const byId = new Map<string, AuditEntry>();
        for (const item of data.logs!) {
          if (item && item.log_id) byId.set(item.log_id, item);
        }
        for (const item of prev) {
          if (item && item.log_id && !byId.has(item.log_id)) {
            byId.set(item.log_id, item);
          }
        }
        return Array.from(byId.values()).sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp)
        );
      });
    } catch {
      // Offline / local fallback remains intact in LocalStorage
    }
  };

  useEffect(() => {
    void syncAuditLogsFromServer();
  }, []);

  const SCREEN_PAGE_NAMES: Record<ActiveScreen, string> = {
    leads: 'Leads Pipeline',
    quotations: 'Quotation Workbench',
    assistant: 'AI Intelligence Assistant',
    audit: 'Audit Trail View',
  };

  const appendAudit = (
    actor: UserSession,
    pageVisited: string,
    actionTaken: AuditAction,
    targetId: string,
    actionDetails: string
  ) => {
    const timestamp = formatKualaLumpurIso();
    let createdEntry: AuditEntry | null = null;

    setAuditEntries((prev) => {
      const logId = generateAuditLogId(prev.length);
      const entry: AuditEntry = {
        log_id: logId,
        timestamp,
        user_name: actor.name,
        user_email: actor.email,
        user_role: actor.role === 'Administrator' ? 'administrator' : 'user',
        department: actor.department,
        page_visited: pageVisited,
        action_taken: actionTaken,
        target_id: targetId || '—',
        action_details: actionDetails,
      };
      createdEntry = entry;
      return [entry, ...prev];
    });

    // Mirror append-only entry to backend immutable log store
    setTimeout(() => {
      if (!createdEntry) return;
      void fetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createdEntry),
      }).catch(() => {
        // LocalStorage retains immutable copy if network call fails
      });
    }, 0);
  };

  const navigateScreen = (nextScreen: ActiveScreen) => {
    setActiveScreen(nextScreen);
    if (session) {
      appendAudit(
        session,
        SCREEN_PAGE_NAMES[nextScreen],
        'VIEW_PAGE',
        '—',
        `Navigated to ${SCREEN_PAGE_NAMES[nextScreen]} (Department filter: ${activeDeptFilter}).`
      );
    }
  };

  const handleOpenTriageModal = () => {
    setTriageModalOpen(true);
    if (session) {
      appendAudit(
        session,
        'Inbound Triage',
        'VIEW_PAGE',
        '—',
        'Opened Step 1 Inbound Lead Triage & Routing form.'
      );
    }
  };

  const handleSelectContactFilter = (nextFilter: 'ALL' | ContactStatus | 'SLA_BREACH') => {
    setContactFilter(nextFilter);
    if (session && nextFilter === 'SLA_BREACH') {
      appendAudit(
        session,
        'SLA Escalations',
        'VIEW_PAGE',
        '—',
        `Opened SLA Escalations filter view (${activeBreachLeads.length} overdue leads).`
      );
    }
  };

  const handleStartSession = (newSession: UserSession) => {
    setSession(newSession);
    appendAudit(
      newSession,
      'Leads Pipeline',
      'VIEW_PAGE',
      '—',
      `Signed into Finance Operations workspace as ${newSession.role.toLowerCase()} (${newSession.email}, ${newSession.department}).`
    );
  };

  const handleSignOut = () => {
    setSelectedLeadId(null);
    setSelectedQuotationId(null);
    setSession(null);
  };

  // Step 1 & 2: Create Lead & Record received_at
  const handleCreateLead = (input: NewLeadInput) => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    const leadCode = generateLeadCode(leads.length);
    const newLead: Lead = {
      id: generateSafeId('lead'),
      leadCode,
      companyName: input.companyName,
      contactPerson: input.contactPerson,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      entityType: input.entityType,
      inquiryNotes: input.inquiryNotes,
      targetDept: input.targetDept,
      secondaryDepts: input.secondaryDepts,
      assignedPicName: input.assignedPicName,
      receivedAt: input.receivedAt || nowIso,
      contactStatus: 'Pending Contact',
      firstContactAt: '',
      outreachChannel: '',
      outreachNotes: '',
      escalationRemindersSent: 0,
      lastReminderAt: '',
      scope: {
        completed: false,
        turnoverTier: '',
        annualTurnoverMyr: 0,
        monthlyTransactionVolume: 0,
        headcount: 0,
        sstRegistered: false,
        requiresIncorporation: false,
        accountingState: '',
        requestedServices: Array.from(new Set([input.targetDept, ...input.secondaryDepts])),
        scopeNotes: '',
        updatedAt: '',
      },
      workflowStage: 'Outreach',
      createdByName: session.name,
      updatedAt: nowIso,
    };

    setLeads((prev) => [newLead, ...prev]);
    appendAudit(
      session,
      'Inbound Triage',
      'TRIAGE_INBOUND_LEAD',
      leadCode,
      `Triaged ${newLead.companyName} (${newLead.entityType}) to ${newLead.targetDept} (PIC: ${newLead.assignedPicName}). 4-working-day SLA clock initiated.`
    );
    setActiveScreen('leads');
    setDrawerOpenInTriageEdit(false);
    setSelectedLeadId(newLead.id);
  };

  // Step 1: Edit Existing Lead Triage Record (EDIT_LEAD_TRIAGE)
  const handleEditLeadTriage = (leadId: string, payload: EditLeadTriagePayload) => {
    if (!session) return;
    const existing = leads.find((l) => l.id === leadId);
    if (!existing) return;
    const nowIso = new Date().toISOString();

    const changes: string[] = [];
    if (existing.companyName !== payload.companyName) {
      changes.push(`Company: "${existing.companyName}" -> "${payload.companyName}"`);
    }
    if (existing.contactPerson !== payload.contactPerson) {
      changes.push(`Contact: "${existing.contactPerson}" -> "${payload.contactPerson}"`);
    }
    if (existing.entityType !== payload.entityType) {
      changes.push(`Entity: "${existing.entityType}" -> "${payload.entityType}"`);
    }
    if (existing.targetDept !== payload.targetDept) {
      changes.push(`Dept: "${existing.targetDept}" -> "${payload.targetDept}"`);
    }
    if (existing.assignedPicName !== payload.assignedPicName) {
      changes.push(`PIC: "${existing.assignedPicName}" -> "${payload.assignedPicName}"`);
    }
    if (existing.contactPhone !== payload.contactPhone) {
      changes.push(`Phone updated`);
    }
    if (existing.contactEmail !== payload.contactEmail) {
      changes.push(`Email updated`);
    }
    if (existing.inquiryNotes !== payload.inquiryNotes) {
      changes.push(`Inquiry notes updated`);
    }

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              companyName: payload.companyName,
              contactPerson: payload.contactPerson,
              contactPhone: payload.contactPhone,
              contactEmail: payload.contactEmail,
              entityType: payload.entityType,
              targetDept: payload.targetDept,
              secondaryDepts: payload.secondaryDepts,
              assignedPicName: payload.assignedPicName,
              inquiryNotes: payload.inquiryNotes,
              updatedAt: nowIso,
            }
          : l
      )
    );

    // Sync updated companyName / targetDept to any non-dispatched linked quotation
    setQuotations((prev) =>
      prev.map((q) =>
        q.leadId === leadId && q.status !== 'Dispatched'
          ? {
              ...q,
              companyName: payload.companyName,
              targetDept: payload.targetDept,
              updatedAt: nowIso,
            }
          : q
      )
    );

    appendAudit(
      session,
      'Leads Pipeline',
      'EDIT_LEAD_TRIAGE',
      existing.leadCode,
      `Edited Step 1 triage record (${changes.length > 0 ? changes.join('; ') : 'Confirmed triage fields'}).`
    );
  };

  // Import from Unified 6-Service-Line Intelligence Assistant (Step 1 Lead Only)
  const handleImportLeadFromAssistant = (result: AssistantResponse, rawInput: string) => {
    if (!session) return;
    const primary = DEPARTMENTS.includes(result.routing.primary_dept)
      ? result.routing.primary_dept
      : session.department;
    const secondaries = (result.routing.secondary_depts || []).filter(
      (d): d is Department => DEPARTMENTS.includes(d) && d !== primary
    );

    handleCreateLead({
      companyName: result.lead_profile.company_name || 'Prospective Client',
      contactPerson: result.lead_profile.contact_person || 'Prospective Contact',
      contactPhone: result.lead_profile.contact_phone || '',
      contactEmail: result.lead_profile.contact_email || '',
      entityType: result.lead_profile.entity_type || 'Unknown',
      inquiryNotes: `${result.routing.routing_reason}\n\nSource Notes:\n${rawInput}`,
      targetDept: primary,
      secondaryDepts: Array.from(new Set(secondaries)),
      assignedPicName: session.name,
      receivedAt: new Date().toISOString(),
    });
  };

  // Import from Unified 6-Service-Line Intelligence Assistant (Lead + Step 6 Quotation -> Pending Approval)
  const handleImportLeadAndQuotationFromAssistant = (
    result: AssistantResponse,
    rawInput: string
  ) => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    const primary = DEPARTMENTS.includes(result.routing.primary_dept)
      ? result.routing.primary_dept
      : session.department;
    const secondaries = (result.routing.secondary_depts || []).filter(
      (d): d is Department => DEPARTMENTS.includes(d) && d !== primary
    );
    const requestedServices = Array.from(new Set([primary, ...secondaries]));

    const leadCode = generateLeadCode(leads.length);
    const newLead: Lead = {
      id: generateSafeId('lead'),
      leadCode,
      companyName: result.lead_profile.company_name || 'Prospective Client',
      contactPerson: result.lead_profile.contact_person || 'Prospective Contact',
      contactPhone: result.lead_profile.contact_phone || '',
      contactEmail: result.lead_profile.contact_email || '',
      entityType: result.lead_profile.entity_type || 'Unknown',
      inquiryNotes: result.routing.routing_reason || rawInput,
      targetDept: primary,
      secondaryDepts: secondaries,
      assignedPicName: session.name,
      receivedAt: nowIso,
      contactStatus: 'Contacted',
      firstContactAt: nowIso,
      outreachChannel: 'Email',
      outreachNotes: 'Scope confirmed and imported via Intelligence Assistant.',
      escalationRemindersSent: 0,
      lastReminderAt: '',
      scope: {
        completed: true,
        turnoverTier: '',
        annualTurnoverMyr: 0,
        monthlyTransactionVolume: 0,
        headcount: 0,
        sstRegistered: false,
        requiresIncorporation: false,
        accountingState: '',
        requestedServices,
        scopeNotes: rawInput,
        updatedAt: nowIso,
      },
      workflowStage: 'Approval',
      createdByName: session.name,
      updatedAt: nowIso,
    };

    const mapCycle = (cycle: string): BillingFrequency => {
      if (cycle === 'Monthly') return 'Monthly';
      if (cycle === 'Annually' || cycle === 'Annual') return 'Annual';
      return 'One-off';
    };

    const lineItems: QuotationLineItem[] = result.quotation.line_items.map((item) => {
      const rate = Math.max(0, Math.round((Number(item.rate_myr) || 0) * 100) / 100);
      const dept = DEPARTMENTS.includes(item.dept) ? item.dept : primary;
      return {
        id: generateSafeId('li'),
        dept,
        description: item.service_title,
        deliverables: item.scope_summary,
        frequency: mapCycle(item.billing_cycle),
        quantity: 1,
        unitPriceMyr: rate,
        lineTotalMyr: rate,
      };
    });

    const totals = computeQuotationTotals(lineItems);
    const quoteNumber = generateQuoteNumber(quotations.length);
    const validityDays = DEFAULT_VALIDITY_DAYS;
    const validUntil = computeValidUntilDate(nowIso, validityDays);

    const newQuotation: Quotation = {
      id: generateSafeId('qt'),
      quoteNumber,
      leadId: newLead.id,
      companyName: newLead.companyName,
      targetDept: primary,
      lineItems,
      ...totals,
      legalRemarks: DEFAULT_LEGAL_REMARKS,
      assumptions: DEFAULT_ASSUMPTIONS,
      exclusions: DEFAULT_EXCLUSIONS,
      validityDays,
      validUntil,
      validityAmendments: [],
      status: 'Pending Approval',
      isApproved: false,
      approvedBy: '',
      approvedAt: '',
      dispatchChannel: '',
      dispatchedAt: '',
      dispatchedBy: '',
      createdByName: session.name,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setLeads((prev) => [newLead, ...prev]);
    setQuotations((prev) => [newQuotation, ...prev]);

    appendAudit(
      session,
      'AI Intelligence Assistant',
      'TRIAGE_INBOUND_LEAD',
      leadCode,
      `Imported scoped lead ${newLead.companyName} (${primary}) via Intelligence Assistant.`
    );
    appendAudit(
      session,
      'Quotation Workbench',
      'GENERATE_QUOTATION',
      quoteNumber,
      `Imported AI-generated MYR quotation for ${newLead.companyName} (${lineItems.length} items, Year-1 ${formatMyr(totals.totalYearOneMyr)}, valid ${validityDays}d until ${validUntil}).`
    );

    setSelectedQuotationId(newQuotation.id);
    setActiveScreen('quotations');
  };

  // Steps 2 & 3: Edit PIC Contact Status & first_contact_at (Freeze SLA Timer on Contacted)
  const handleUpdateOutreach = (
    leadId: string,
    payload: {
      contactStatus: ContactStatus;
      firstContactAt: string;
      outreachChannel: OutreachChannel;
      outreachNotes: string;
    }
  ) => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;

    const firstContactAt =
      payload.contactStatus === 'Contacted'
        ? payload.firstContactAt || targetLead.firstContactAt || nowIso
        : payload.contactStatus === 'Pending Contact'
          ? ''
          : payload.firstContactAt || targetLead.firstContactAt;

    const nextStage: WorkflowStage =
      payload.contactStatus === 'Contacted'
        ? targetLead.workflowStage === 'Triage' ||
          targetLead.workflowStage === 'Outreach' ||
          targetLead.workflowStage === 'Unreachable'
          ? 'Scope'
          : targetLead.workflowStage
        : payload.contactStatus === 'Unreachable'
          ? 'Unreachable'
          : 'Outreach';

    const updatedLead: Lead = {
      ...targetLead,
      contactStatus: payload.contactStatus,
      firstContactAt,
      outreachChannel: payload.outreachChannel,
      outreachNotes: payload.outreachNotes,
      workflowStage: nextStage,
      updatedAt: nowIso,
    };

    setLeads((prev) => prev.map((l) => (l.id === leadId ? updatedLead : l)));
    const sla = evaluateLeadSla(updatedLead);
    appendAudit(
      session,
      'Leads Pipeline',
      'EDIT_CONTACT_STATUS',
      targetLead.leadCode,
      `Edited contact record for ${targetLead.companyName}: status "${targetLead.contactStatus}" -> "${payload.contactStatus}", channel "${payload.outreachChannel || 'Direct'}", first_contact_at "${firstContactAt || '—'}". SLA: ${sla.label}.`
    );
  };

  // Step 5: Log SLA Escalation Reminder
  const handleLogSlaReminder = (leadId: string) => {
    if (!session) return;
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;
    const nowIso = new Date().toISOString();
    const sla = evaluateLeadSla(targetLead);
    const nextCount = targetLead.escalationRemindersSent + 1;

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              escalationRemindersSent: nextCount,
              lastReminderAt: nowIso,
              updatedAt: nowIso,
            }
          : l
      )
    );

    appendAudit(
      session,
      'SLA Escalations',
      'UPDATE_CONTACT_STATUS',
      targetLead.leadCode,
      `Logged SLA BREACH reminder #${nextCount} for PIC ${targetLead.assignedPicName} on ${targetLead.companyName} (${sla.workingDaysElapsed} working days uncontacted).`
    );
  };

  // Step 4: Save Confirmed Client Scope
  const handleSaveScope = (
    leadId: string,
    scopeInput: Omit<LeadScope, 'completed' | 'updatedAt'>
  ) => {
    if (!session) return;
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;
    const nowIso = new Date().toISOString();

    const updatedLead: Lead = {
      ...targetLead,
      scope: {
        ...scopeInput,
        completed: true,
        updatedAt: nowIso,
      },
      workflowStage:
        targetLead.workflowStage === 'Triage' ||
        targetLead.workflowStage === 'Outreach' ||
        targetLead.workflowStage === 'Scope'
          ? 'Quotation'
          : targetLead.workflowStage,
      updatedAt: nowIso,
    };

    setLeads((prev) => prev.map((l) => (l.id === leadId ? updatedLead : l)));
    appendAudit(
      session,
      'Leads Pipeline',
      'LOG_SERVICE_SCOPE',
      targetLead.leadCode,
      `Logged confirmed scope for ${targetLead.companyName}: Turnover ${formatMyr(scopeInput.annualTurnoverMyr)}, ${scopeInput.monthlyTransactionVolume} tx/mo, ${scopeInput.headcount} staff, services [${scopeInput.requestedServices.join(', ')}].`
    );
  };

  // Step 6: Generate Quotation Draft (Enters Pending Approval)
  const handleGenerateQuotation = (
    leadId: string,
    scopeInput: Omit<LeadScope, 'completed' | 'updatedAt'>
  ) => {
    if (!session) return;
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;
    const nowIso = new Date().toISOString();

    const scopedLead: Lead = {
      ...targetLead,
      scope: {
        ...scopeInput,
        completed: true,
        updatedAt: nowIso,
      },
      workflowStage: 'Approval',
      updatedAt: nowIso,
    };

    const items = buildBaselineQuotationItems(scopedLead);
    const totals = computeQuotationTotals(items);
    const quoteNumber = generateQuoteNumber(quotations.length);

    const newQuotation: Quotation = {
      id: generateSafeId('qt'),
      quoteNumber,
      leadId: scopedLead.id,
      companyName: scopedLead.companyName,
      targetDept: scopedLead.targetDept,
      lineItems: items,
      ...totals,
      legalRemarks: DEFAULT_LEGAL_REMARKS,
      assumptions: DEFAULT_ASSUMPTIONS,
      exclusions: DEFAULT_EXCLUSIONS,
      validityDays: DEFAULT_VALIDITY_DAYS,
      validUntil: computeValidUntilDate(nowIso, DEFAULT_VALIDITY_DAYS),
      validityAmendments: [],
      status: 'Pending Approval',
      isApproved: false,
      approvedBy: '',
      approvedAt: '',
      dispatchChannel: '',
      dispatchedAt: '',
      dispatchedBy: '',
      createdByName: session.name,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setLeads((prev) => prev.map((l) => (l.id === leadId ? scopedLead : l)));
    setQuotations((prev) => [newQuotation, ...prev]);

    appendAudit(
      session,
      'Quotation Workbench',
      'GENERATE_QUOTATION',
      quoteNumber,
      `Generated Malaysian SME quotation draft for ${scopedLead.companyName} (${items.length} line items, Year-1 ${formatMyr(totals.totalYearOneMyr)}, valid ${DEFAULT_VALIDITY_DAYS} days until ${newQuotation.validUntil}). Entered Pending Approval.`
    );

    setSelectedLeadId(null);
    setSelectedQuotationId(newQuotation.id);
    setActiveScreen('quotations');
  };

  // Step 6 Edit Draft Line Items (Locked once Approved or Dispatched)
  const handleUpdateQuotationContent = (
    quotationId: string,
    payload: {
      lineItems: QuotationLineItem[];
      legalRemarks: string;
      assumptions: string;
      exclusions: string;
    }
  ) => {
    if (!session) return;
    const existing = quotations.find((q) => q.id === quotationId);
    if (!existing || existing.isApproved || existing.status === 'Dispatched') return;

    const nowIso = new Date().toISOString();
    const totals = computeQuotationTotals(payload.lineItems);

    setQuotations((prev) =>
      prev.map((q) =>
        q.id === quotationId
          ? {
              ...q,
              lineItems: payload.lineItems,
              legalRemarks: payload.legalRemarks,
              assumptions: payload.assumptions,
              exclusions: payload.exclusions,
              ...totals,
              updatedAt: nowIso,
            }
          : q
      )
    );

    appendAudit(
      session,
      'Quotation Workbench',
      'EDIT_QUOTATION_DRAFT',
      existing.quoteNumber,
      `Edited draft quotation for ${existing.companyName}: Year-1 ${formatMyr(existing.totalYearOneMyr)} -> ${formatMyr(totals.totalYearOneMyr)} (${existing.lineItems.length} -> ${payload.lineItems.length} items).`
    );
  };

  // Step 7: Administrator-Only Quotation Approval Gate
  const handleToggleApproval = (quotationId: string, approved: boolean) => {
    if (!session || session.role !== 'Administrator') return;
    const existing = quotations.find((q) => q.id === quotationId);
    if (!existing || existing.status === 'Dispatched') return;

    const nowIso = new Date().toISOString();
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === quotationId
          ? {
              ...q,
              isApproved: approved,
              status: approved ? 'Approved' : 'Pending Approval',
              approvedBy: approved ? `${session.name} (${session.email})` : '',
              approvedAt: approved ? nowIso : '',
              updatedAt: nowIso,
            }
          : q
      )
    );

    appendAudit(
      session,
      'Quotation Workbench',
      'APPROVE_QUOTATION',
      existing.quoteNumber,
      `is_approved changed: ${existing.isApproved} -> ${approved} by Administrator ${session.name} for ${existing.companyName} (Year-1 ${formatMyr(existing.totalYearOneMyr)}).`
    );
  };

  // Administrator-Only Quotation Validity Amendment
  const handleAmendQuotationValidity = (
    quotationId: string,
    newValidityDays: number,
    newValidUntil: string
  ) => {
    if (!session || session.role !== 'Administrator') return;
    const existing = quotations.find((q) => q.id === quotationId);
    if (!existing) return;

    const nowIso = formatKualaLumpurIso();
    const prevDays = existing.validityDays || DEFAULT_VALIDITY_DAYS;
    const prevUntil =
      existing.validUntil || computeValidUntilDate(existing.createdAt, prevDays);
    const previousValidity = formatValiditySummary(prevDays, prevUntil);
    const safeNewDays = Math.max(1, Math.floor(newValidityDays || DEFAULT_VALIDITY_DAYS));
    const safeNewUntil =
      newValidUntil && /^\d{4}-\d{2}-\d{2}$/.test(newValidUntil)
        ? newValidUntil
        : computeValidUntilDate(existing.createdAt, safeNewDays);
    const newValidity = formatValiditySummary(safeNewDays, safeNewUntil);
    const amendedBy = `${session.name} (${session.email})`;

    const amendmentRecord = {
      amended_by: amendedBy,
      previous_validity: previousValidity,
      new_validity: newValidity,
      amendment_timestamp: nowIso,
    };

    setQuotations((prev) =>
      prev.map((q) =>
        q.id === quotationId
          ? {
              ...q,
              validityDays: safeNewDays,
              validUntil: safeNewUntil,
              validityAmendments: [amendmentRecord, ...(q.validityAmendments || [])],
              updatedAt: nowIso,
            }
          : q
      )
    );

    appendAudit(
      session,
      'Quotation Workbench',
      'AMEND_QUOTATION_VALIDITY',
      existing.quoteNumber,
      `amended_by: ${amendedBy} | previous_validity: ${previousValidity} -> new_validity: ${newValidity} | amendment_timestamp: ${nowIso}`
    );
  };

  // Step 8: Gated Dispatch (Strict isApproved Guardrail + Permanent Lock)
  const handleDispatchQuotation = (
    quotationId: string,
    channel: Exclude<DispatchChannel, ''>
  ) => {
    if (!session) return;
    const existing = quotations.find((q) => q.id === quotationId);
    if (!existing || !existing.isApproved || existing.status === 'Dispatched') return;

    const nowIso = new Date().toISOString();
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === quotationId
          ? {
              ...q,
              status: 'Dispatched',
              dispatchChannel: channel,
              dispatchedAt: nowIso,
              dispatchedBy: session.name,
              updatedAt: nowIso,
            }
          : q
      )
    );

    setLeads((prev) =>
      prev.map((l) =>
        l.id === existing.leadId
          ? { ...l, workflowStage: 'Dispatched', updatedAt: nowIso }
          : l
      )
    );

    appendAudit(
      session,
      'Quotation Workbench',
      'DISPATCH_QUOTATION',
      existing.quoteNumber,
      `Dispatched Administrator-approved quotation for ${existing.companyName} via ${channel}. Line items permanently locked.`
    );
  };

  // Derived indexes & SLA metrics
  const leadsById = useMemo(() => {
    const map: Record<string, Lead> = {};
    for (const lead of leads) map[lead.id] = lead;
    return map;
  }, [leads]);

  const quotationByLeadId = useMemo(() => {
    const map: Record<string, Quotation> = {};
    for (const q of quotations) {
      if (!map[q.leadId]) map[q.leadId] = q;
    }
    return map;
  }, [quotations]);

  const slaByLeadId = useMemo(() => {
    const map: Record<string, ReturnType<typeof evaluateLeadSla>> = {};
    for (const lead of leads) {
      map[lead.id] = evaluateLeadSla(lead);
    }
    return map;
  }, [leads]);

  const deptScopedLeads = useMemo(() => {
    if (activeDeptFilter === 'ALL') return leads;
    return leads.filter(
      (l) => l.targetDept === activeDeptFilter || l.secondaryDepts.includes(activeDeptFilter)
    );
  }, [leads, activeDeptFilter]);

  const deptScopedQuotations = useMemo(() => {
    if (activeDeptFilter === 'ALL') return quotations;
    return quotations.filter((q) => q.targetDept === activeDeptFilter);
  }, [quotations, activeDeptFilter]);

  const activeBreachLeads = useMemo(
    () =>
      deptScopedLeads.filter(
        (l) => l.contactStatus === 'Pending Contact' && slaByLeadId[l.id]?.isBreached
      ),
    [deptScopedLeads, slaByLeadId]
  );

  const pendingApprovalsCount = useMemo(
    () => deptScopedQuotations.filter((q) => !q.isApproved).length,
    [deptScopedQuotations]
  );

  const totalPipelineMyr = useMemo(
    () => deptScopedQuotations.reduce((sum, q) => sum + q.totalYearOneMyr, 0),
    [deptScopedQuotations]
  );

  const visibleLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deptScopedLeads.filter((lead) => {
      if (contactFilter === 'SLA_BREACH') {
        if (!(lead.contactStatus === 'Pending Contact' && slaByLeadId[lead.id]?.isBreached)) {
          return false;
        }
      } else if (contactFilter !== 'ALL' && lead.contactStatus !== contactFilter) {
        return false;
      }

      if (!q) return true;
      return (
        lead.companyName.toLowerCase().includes(q) ||
        lead.leadCode.toLowerCase().includes(q) ||
        lead.contactPerson.toLowerCase().includes(q) ||
        lead.assignedPicName.toLowerCase().includes(q)
      );
    });
  }, [deptScopedLeads, contactFilter, searchQuery, slaByLeadId]);

  const selectedLead = selectedLeadId ? leadsById[selectedLeadId] || null : null;

  if (!session) {
    return <SessionGate onStartSession={handleStartSession} />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* Screen 1: Top Navigation Bar */}
      <header className="bg-white border-b border-[#E3E3E3] sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left: T.J. Wang 50th Anniversary Logo + Primary Screen Links */}
          <div className="flex items-center gap-6 min-w-0">
            <BrandLogo compact />

            <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
              {(
                [
                  { id: 'leads', label: 'Leads Pipeline', count: deptScopedLeads.length },
                  { id: 'quotations', label: 'Quotations', count: deptScopedQuotations.length },
                  { id: 'assistant', label: 'AI Assistant', count: null },
                  { id: 'audit', label: 'Audit Log', count: auditEntries.length },
                ] as const
              ).map((tab) => {
                const active = activeScreen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => navigateScreen(tab.id)}
                    className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      active
                        ? 'border-[#CB3737] text-[#171717] font-semibold'
                        : 'border-transparent text-neutral-500 hover:text-[#171717]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span className="font-mono text-xs tabular-nums text-neutral-400">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Department Switcher, User Profile + Role Badge, Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <select
              aria-label="Active department switcher"
              value={activeDeptFilter}
              onChange={(e) => setActiveDeptFilter(e.target.value as 'ALL' | Department)}
              className="px-2.5 py-1.5 text-xs font-medium bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg text-neutral-700 focus:outline-none focus:border-[#CB3737]"
            >
              <option value="ALL">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-[#E3E3E3]">
              <div className="text-right leading-tight">
                <p className="text-xs font-semibold text-[#171717] max-w-[140px] truncate">
                  {session.name}
                </p>
                <p className="text-[11px] font-medium">
                  <span
                    className={
                      session.role === 'Administrator'
                        ? 'text-[#CB3737] font-semibold'
                        : 'text-neutral-500'
                    }
                  >
                    {session.role}
                  </span>
                  <span className="text-neutral-400"> · {session.department}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Switch user or role session"
                className="p-2 text-neutral-400 hover:text-[#CB3737] rounded-lg hover:bg-[#FAFAFA] transition-colors cursor-pointer"
                aria-label="Switch user session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenTriageModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Lead
            </button>
          </div>
        </div>

        {/* Mobile Tab Row */}
        <div className="md:hidden border-t border-[#E3E3E3] px-4 py-2 flex items-center justify-between gap-2 bg-[#FAFAFA]">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'leads', label: 'Leads' },
                { id: 'quotations', label: 'Quotations' },
                { id: 'assistant', label: 'AI Assistant' },
                { id: 'audit', label: 'Audit' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateScreen(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md ${
                  activeScreen === tab.id
                    ? 'bg-[#CB3737] text-white'
                    : 'text-neutral-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs font-medium text-neutral-600 flex items-center gap-1"
          >
            {session.role}
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-7 space-y-6">
        {/* Screen Heading */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#171717]">
              {activeScreen === 'leads'
                ? 'Leads Workbench & 4-Day SLA Pipeline'
                : activeScreen === 'quotations'
                  ? 'Quotation Workbench & Approval Gate'
                  : activeScreen === 'assistant'
                    ? 'Lead Triage & Quotation Intelligence Assistant'
                    : 'Audit & Activity Log'}
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              T.J. Wang Finance Department ·{' '}
              {activeDeptFilter === 'ALL' ? 'All 6 Service Lines' : `${activeDeptFilter} View`} ·
              Local Browser Storage (Zero-Cost)
            </p>
          </div>
        </div>

        {/* SCREEN 3: LEADS WORKBENCH / PIPELINE VIEW */}
        {activeScreen === 'leads' && (
          <div className="space-y-5">
            {/* 4-Column KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E3E3E3] rounded-xl p-5">
                <p className="text-xs text-neutral-500">Tracked Leads</p>
                <p className="text-2xl font-bold text-[#171717] font-mono tabular-nums mt-1">
                  {deptScopedLeads.length}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {deptScopedLeads.filter((l) => l.contactStatus === 'Contacted').length} contacted
                </p>
              </div>

              <div className="bg-white border border-[#E3E3E3] rounded-xl p-5">
                <p className="text-xs text-neutral-500">SLA Breaches (&ge;4 Working Days)</p>
                <p
                  className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                    activeBreachLeads.length > 0 ? 'text-[#CB3737]' : 'text-emerald-700'
                  }`}
                >
                  {activeBreachLeads.length}
                </p>
                <p className="text-xs text-neutral-500 mt-1">Pending contact past 4d limit</p>
              </div>

              <div className="bg-white border border-[#E3E3E3] rounded-xl p-5">
                <p className="text-xs text-neutral-500">Pending Admin Approval</p>
                <p
                  className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                    pendingApprovalsCount > 0 ? 'text-[#EE6F57]' : 'text-[#171717]'
                  }`}
                >
                  {pendingApprovalsCount}
                </p>
                <p className="text-xs text-neutral-500 mt-1">Awaiting Step 7 sign-off</p>
              </div>

              <div className="bg-white border border-[#E3E3E3] rounded-xl p-5">
                <p className="text-xs text-neutral-500">Quoted Year-1 Value</p>
                <p className="text-2xl font-bold text-[#171717] font-mono tabular-nums mt-1">
                  {formatMyr(totalPipelineMyr)}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {deptScopedQuotations.filter((q) => q.status === 'Dispatched').length} dispatched
                </p>
              </div>
            </div>

            {/* Step 5 High-Visibility SLA Escalation Alert Strip */}
            {activeBreachLeads.length > 0 && (
              <div className="p-4 bg-[#CB3737]/8 border border-[#CB3737]/30 rounded-xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-[#7F1D1D]">
                  <AlertTriangle className="w-4 h-4 text-[#CB3737] shrink-0" />
                  <span>
                    <strong className="text-[#CB3737]">
                      SLA BREACH / OVERDUE ({activeBreachLeads.length}{' '}
                      {activeBreachLeads.length === 1 ? 'lead' : 'leads'}):
                    </strong>{' '}
                    Uncontacted for 4 or more working days. Assigned PIC outreach is urgently
                    required.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectContactFilter('SLA_BREACH')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  View Escalations ({activeBreachLeads.length})
                </button>
              </div>
            )}

            {/* Pipeline Table Card */}
            <div className="bg-white border border-[#E3E3E3] rounded-xl overflow-hidden">
              {/* Filter Bar */}
              <div className="px-5 py-3.5 border-b border-[#E3E3E3] flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search company, lead code, contact, or PIC..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg focus:outline-none focus:bg-white focus:border-[#CB3737]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                  {(
                    [
                      { id: 'ALL', label: 'All Statuses' },
                      { id: 'Pending Contact', label: 'Pending Contact' },
                      { id: 'Contacted', label: 'Contacted' },
                      { id: 'Unreachable', label: 'Unreachable' },
                      {
                        id: 'SLA_BREACH',
                        label: `SLA Breaches (${activeBreachLeads.length})`,
                      },
                    ] as const
                  ).map((item) => {
                    const active = contactFilter === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectContactFilter(item.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          active
                            ? item.id === 'SLA_BREACH'
                              ? 'bg-[#CB3737] text-white'
                              : 'bg-[#171717] text-white'
                            : item.id === 'SLA_BREACH' && activeBreachLeads.length > 0
                              ? 'text-[#CB3737] hover:bg-[#CB3737]/10'
                              : 'text-neutral-600 hover:text-[#171717]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Empty States vs Populated Table */}
              {leads.length === 0 ? (
                <div className="p-14 text-center space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-[#171717]">
                      No inbound leads recorded yet
                    </p>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                      Start the 8-step T.J. Wang Finance Department workflow by triaging your first
                      client inquiry across Co Sec, Accounting, Audit, Tax, Payroll, or Finance.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenTriageModal}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log First Inbound Lead (Step 1)
                  </button>
                </div>
              ) : visibleLeads.length === 0 ? (
                <div className="p-10 text-center text-xs text-neutral-500">
                  No leads match the selected department, status, or search filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAFAFA] border-b border-[#E3E3E3] text-xs font-medium text-neutral-500">
                        <th className="py-3 px-5">Lead &amp; Company</th>
                        <th className="py-3 px-4">Department &amp; PIC</th>
                        <th className="py-3 px-4">Assigned</th>
                        <th className="py-3 px-4">Contact Status</th>
                        <th className="py-3 px-4">4-Day SLA Tracker</th>
                        <th className="py-3 px-4 text-right">Quotation</th>
                        <th className="py-3 px-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E3E3] text-xs">
                      {visibleLeads.map((lead) => {
                        const sla = slaByLeadId[lead.id];
                        const quote = quotationByLeadId[lead.id];
                        const isOverdue =
                          lead.contactStatus === 'Pending Contact' && sla?.isBreached;

                        return (
                          <tr
                            key={lead.id}
                            onClick={() => setSelectedLeadId(lead.id)}
                            className={`cursor-pointer transition-colors ${
                              isOverdue
                                ? 'bg-[#CB3737]/5 hover:bg-[#CB3737]/10'
                                : 'hover:bg-[#FAFAFA]'
                            }`}
                          >
                            <td className="py-3.5 px-5">
                              <p className="font-semibold text-[#171717]">{lead.companyName}</p>
                              <p className="text-neutral-500 mt-0.5 font-mono tabular-nums">
                                {lead.leadCode} ·{' '}
                                <span className="font-sans">
                                  {lead.contactPerson} ({lead.entityType})
                                </span>
                              </p>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="font-medium text-[#171717]">{lead.assignedPicName}</p>
                              <p className="text-neutral-500 mt-0.5">
                                {lead.targetDept}
                                {lead.secondaryDepts.length > 0
                                  ? ` · ${lead.secondaryDepts.join(', ')}`
                                  : ''}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-600 whitespace-nowrap">
                              {formatDateShort(lead.receivedAt)}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={
                                  lead.contactStatus === 'Contacted'
                                    ? 'font-semibold text-emerald-700'
                                    : lead.contactStatus === 'Unreachable'
                                      ? 'font-medium text-neutral-500'
                                      : 'font-medium text-[#EE6F57]'
                                }
                              >
                                {lead.contactStatus}
                              </span>
                              <span className="text-neutral-400"> · {lead.workflowStage}</span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                              {isOverdue ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[#CB3737]">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  SLA BREACH / OVERDUE ({sla.workingDaysElapsed}d)
                                </span>
                              ) : (
                                <span
                                  className={`font-sans font-medium ${
                                    sla?.isBreached
                                      ? 'text-[#CB3737]'
                                      : sla?.isFrozen
                                        ? 'text-emerald-700'
                                        : 'text-neutral-600'
                                  }`}
                                >
                                  {sla?.label}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                              {quote ? (
                                <div>
                                  <p className="font-semibold text-[#171717]">
                                    {formatMyr(quote.totalYearOneMyr)}
                                  </p>
                                  <p className="font-sans text-neutral-500 mt-0.5">
                                    {quote.status}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerOpenInTriageEdit(true);
                                    setSelectedLeadId(lead.id);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-md hover:bg-[#CB3737] hover:text-white transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerOpenInTriageEdit(false);
                                    setSelectedLeadId(lead.id);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-[#171717] bg-white border border-[#E3E3E3] rounded-md hover:border-[#CB3737] hover:text-[#CB3737] transition-colors cursor-pointer"
                                >
                                  Manage
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 4: QUOTATION WORKBENCH (STEPS 6-8) */}
        {activeScreen === 'quotations' && (
          <QuotationWorkbench
            quotations={deptScopedQuotations}
            leadsById={leadsById}
            selectedQuotationId={selectedQuotationId}
            onSelectQuotation={(id) => setSelectedQuotationId(id)}
            session={session}
            onUpdateQuotationContent={handleUpdateQuotationContent}
            onToggleApproval={handleToggleApproval}
            onAmendValidity={handleAmendQuotationValidity}
            onDispatchQuotation={handleDispatchQuotation}
          />
        )}

        {/* AI INTELLIGENCE ASSISTANT (6 SERVICE LINES) */}
        {activeScreen === 'assistant' && (
          <AssistantWorkbench
            session={session}
            onImportLead={handleImportLeadFromAssistant}
            onImportLeadAndQuotation={handleImportLeadAndQuotationFromAssistant}
            onAuditEventCreated={(entry) =>
              setAuditEntries((prev) =>
                prev.some((e) => e.log_id === entry.log_id) ? prev : [entry, ...prev]
              )
            }
          />
        )}

        {/* SCREEN 5: IMMUTABLE AUDIT TRAIL VIEW */}
        {activeScreen === 'audit' && (
          <AuditLogView
            entries={auditEntries}
            session={session}
            onSyncServerLogs={syncAuditLogsFromServer}
          />
        )}
      </main>

      {/* Screen 2: Inbound Triage Modal (Step 1) */}
      <InboundTriageModal
        open={triageModalOpen}
        onClose={() => setTriageModalOpen(false)}
        session={session}
        onCreateLead={handleCreateLead}
      />

      {/* Steps 1-6 Lead Detail Workspace Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        linkedQuotation={selectedLead ? quotationByLeadId[selectedLead.id] : undefined}
        initialEditTriage={drawerOpenInTriageEdit}
        onClose={() => {
          setSelectedLeadId(null);
          setDrawerOpenInTriageEdit(false);
        }}
        onEditLeadTriage={handleEditLeadTriage}
        onUpdateOutreach={handleUpdateOutreach}
        onLogSlaReminder={handleLogSlaReminder}
        onSaveScope={handleSaveScope}
        onGenerateQuotation={handleGenerateQuotation}
        onOpenQuotation={(quotationId) => {
          setSelectedLeadId(null);
          setDrawerOpenInTriageEdit(false);
          setSelectedQuotationId(quotationId);
          setActiveScreen('quotations');
        }}
      />
    </div>
  );
}
