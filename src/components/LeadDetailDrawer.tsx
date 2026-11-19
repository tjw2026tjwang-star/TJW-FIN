import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ACCOUNTING_STATES,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  ENTITY_TYPES,
  type AccountingState,
  type AiQuotationResult,
  type ContactStatus,
  type Department,
  type EntityType,
  type Lead,
  type OrgConfig,
  type OutreachChannel,
  type Quotation,
  type UserProfile,
} from '../types';
import { evaluateLeadSla, formatDateTime, formatMyr } from '../lib/sla';
import {
  createQuotationWithItems,
  logOutreachAndStatus,
  saveLeadScope,
} from '../lib/firestoreService';

interface LeadDetailDrawerProps {
  lead: Lead | null;
  linkedQuotation?: Quotation;
  actor: UserProfile;
  orgConfig: OrgConfig;
  onClose: () => void;
  onOpenQuotation: (quotationId: string) => void;
}

const PIPELINE_STEPS = [
  { key: 'Triage', label: '1. Triage' },
  { key: 'Outreach', label: '2–3. Outreach' },
  { key: 'Scope', label: '4. Scope' },
  { key: 'Quotation', label: '6. Quotation' },
  { key: 'Approval', label: '7. Approval' },
  { key: 'Dispatched', label: '8. Dispatch' },
] as const;

function getStepIndex(stage: Lead['workflowStage']): number {
  const idx = PIPELINE_STEPS.findIndex((s) => s.key === stage);
  return idx === -1 ? 1 : idx;
}

export function LeadDetailDrawer({
  lead,
  linkedQuotation,
  actor,
  orgConfig,
  onClose,
  onOpenQuotation,
}: LeadDetailDrawerProps) {
  const [showRawEmail, setShowRawEmail] = useState(false);

  // Step 2 & 3 Outreach form state
  const [contactStatus, setContactStatus] = useState<ContactStatus>('Pending Contact');
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel>('Phone');
  const [outreachNotes, setOutreachNotes] = useState('');
  const [savingOutreach, setSavingOutreach] = useState(false);

  // Step 4 Scope form state
  const [entityType, setEntityType] = useState<EntityType>('Sdn Bhd');
  const [annualTurnoverMyr, setAnnualTurnoverMyr] = useState('');
  const [monthlyBankTxCount, setMonthlyBankTxCount] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [accountingState, setAccountingState] = useState<AccountingState>('Up-to-date');
  const [sstRegistered, setSstRegistered] = useState(false);
  const [serviceLines, setServiceLines] = useState<Department[]>([]);
  const [scopeNotes, setScopeNotes] = useState('');
  const [savingScope, setSavingScope] = useState(false);

  // Step 6 AI Quotation state
  const [generatingQuote, setGeneratingQuote] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) return;
    setContactStatus(lead.contactStatus);
    setOutreachChannel(lead.outreachChannel || 'Phone');
    setOutreachNotes(lead.outreachNotes || '');
    setEntityType(lead.entityType || 'Sdn Bhd');
    setAnnualTurnoverMyr(lead.annualTurnoverMyr ? String(lead.annualTurnoverMyr) : '');
    setMonthlyBankTxCount(lead.monthlyBankTxCount ? String(lead.monthlyBankTxCount) : '');
    setHeadcount(lead.headcount ? String(lead.headcount) : '');
    setAccountingState(lead.accountingState || 'Up-to-date');
    setSstRegistered(Boolean(lead.sstRegistered));
    setServiceLines(lead.serviceLines || [lead.assignedDept]);
    setScopeNotes(lead.scopeNotes || '');
    setShowRawEmail(false);
    setStatusMessage(null);
    setError(null);
  }, [lead]);

  if (!lead) return null;

  const sla = evaluateLeadSla(lead, orgConfig.slaWorkingDays, orgConfig.publicHolidays);
  const activeStepIdx = getStepIndex(lead.workflowStage);

  const toggleService = (dept: Department) => {
    setServiceLines((prev) => {
      if (prev.includes(dept)) {
        return prev.length > 1 ? prev.filter((d) => d !== dept) : prev;
      }
      return [...prev, dept];
    });
  };

  const handleSaveOutreach = async () => {
    setSavingOutreach(true);
    setError(null);
    setStatusMessage(null);
    try {
      await logOutreachAndStatus(
        lead,
        {
          contactStatus,
          outreachChannel,
          outreachNotes,
        },
        actor,
        orgConfig
      );
      setStatusMessage('Outreach status and SLA timestamp recorded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save outreach update.');
    } finally {
      setSavingOutreach(false);
    }
  };

  const handleSaveScope = async () => {
    setSavingScope(true);
    setError(null);
    setStatusMessage(null);
    try {
      await saveLeadScope(
        lead,
        {
          entityType,
          annualTurnoverMyr: Number(annualTurnoverMyr) || 0,
          monthlyBankTxCount: Number(monthlyBankTxCount) || 0,
          headcount: Number(headcount) || 0,
          accountingState,
          sstRegistered,
          serviceLines,
          scopeNotes,
        },
        actor
      );
      setStatusMessage('Step 4 scope specification saved. Ready for AI quotation generation.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save scope.');
    } finally {
      setSavingScope(false);
    }
  };

  const handleGenerateQuotation = async () => {
    setGeneratingQuote(true);
    setError(null);
    setStatusMessage(null);
    try {
      // Save latest scope changes before generating if modified
      if (lead.contactStatus === 'Contacted') {
        await saveLeadScope(
          lead,
          {
            entityType,
            annualTurnoverMyr: Number(annualTurnoverMyr) || 0,
            monthlyBankTxCount: Number(monthlyBankTxCount) || 0,
            headcount: Number(headcount) || 0,
            accountingState,
            sstRegistered,
            serviceLines,
            scopeNotes,
          },
          actor
        );
      }

      const res = await fetch('/api/ai/generate-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: lead.companyName,
          entityType,
          annualTurnoverMyr: Number(annualTurnoverMyr) || 0,
          monthlyBankTxCount: Number(monthlyBankTxCount) || 0,
          headcount: Number(headcount) || 0,
          accountingState,
          sstRegistered,
          serviceLines,
          scopeNotes,
          inquirySummary: lead.inquirySummary,
        }),
      });

      const data = (await res.json()) as { quotation?: AiQuotationResult; error?: string };
      if (!res.ok || !data.quotation) {
        throw new Error(data.error || 'AI Quotation Engine returned an error.');
      }

      const updatedLead: Lead = {
        ...lead,
        entityType,
        annualTurnoverMyr: Number(annualTurnoverMyr) || 0,
        monthlyBankTxCount: Number(monthlyBankTxCount) || 0,
        headcount: Number(headcount) || 0,
        accountingState,
        sstRegistered,
        serviceLines,
        scopeNotes,
        scopeCompleted: true,
      };

      const createdQuote = await createQuotationWithItems(
        updatedLead,
        data.quotation,
        actor,
        orgConfig
      );
      onOpenQuotation(createdQuote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI quotation.');
    } finally {
      setGeneratingQuote(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Lead detail for ${lead.companyName}`}
    >
      <div className="bg-white w-full max-w-2xl h-full border-l border-slate-200 flex flex-col">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>{lead.leadCode}</span>
              <span aria-hidden="true">·</span>
              <span className="font-sans">{DEPARTMENT_LABELS[lead.assignedDept]}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-sans font-medium ${
                  sla.isBreached
                    ? 'text-red-700'
                    : sla.isApproaching
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                {sla.label}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 truncate mt-1">
              {lead.companyName}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {lead.contactPerson}
              {lead.contactEmail ? ` · ${lead.contactEmail}` : ''}
              {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Close lead workspace"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 8-Step Horizontal Progress Strip */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
          {PIPELINE_STEPS.map((step, idx) => {
            const done = idx < activeStepIdx;
            const current = idx === activeStepIdx;
            return (
              <div
                key={step.key}
                className={`flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 ${
                  current
                    ? 'text-slate-900 font-semibold'
                    : done
                      ? 'text-emerald-700 font-medium'
                      : 'text-slate-400'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{step.label}</span>
                {idx < PIPELINE_STEPS.length - 1 && (
                  <span className="text-slate-300 pl-1" aria-hidden="true">
                    /
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* SLA Breach Alert Banner (Step 5 indicator) */}
          {sla.isBreached && lead.contactStatus === 'Pending Contact' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 space-y-1">
                <p className="font-semibold">
                  SLA Breached — {sla.workingDaysElapsed} working days uncontacted (Limit: {orgConfig.slaWorkingDays}d)
                </p>
                <p className="text-red-800">
                  Assigned PIC: {lead.assignedPicName}. Immediate client outreach is required.
                  {lead.escalationCount > 0 &&
                    ` Escalation reminders sent: ${lead.escalationCount} (last at ${formatDateTime(lead.escalationSentAtIso)}).`}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
              {statusMessage}
            </div>
          )}

          {/* Linked Quotation Callout */}
          {linkedQuotation && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-slate-500">
                  Active Quotation · {linkedQuotation.status}
                </p>
                <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                  {linkedQuotation.quoteNumber} · Year-1 {formatMyr(linkedQuotation.totalContractValueMyr)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenQuotation(linkedQuotation.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Open Quotation
              </button>
            </div>
          )}

          {/* Section 1: Inquiry Brief */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-900">
                01. Inbound Inquiry &amp; Triage Routing
              </h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Received {formatDateTime(lead.receivedAtIso)}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{lead.inquirySummary}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>PIC: {lead.assignedPicName}</span>
              <span aria-hidden="true">·</span>
              <span>Services: {lead.serviceLines.join(', ')}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowRawEmail((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {showRawEmail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showRawEmail ? 'Hide raw inbound email' : 'Inspect raw inbound email'}
            </button>
            {showRawEmail && (
              <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {`Subject: ${lead.emailSubject}\n\n${lead.rawEmailBody}`}
              </pre>
            )}
          </section>

          <hr className="border-slate-200" />

          {/* Section 2 & 3: PIC Outreach & 4-Day SLA Tracking */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-900">
                02. Department PIC Outreach &amp; SLA Verification
              </h3>
              {lead.firstContactAtIso && (
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  First contact: {formatDateTime(lead.firstContactAtIso)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Contact Status
                </label>
                <select
                  value={contactStatus}
                  onChange={(e) => setContactStatus(e.target.value as ContactStatus)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                >
                  <option value="Pending Contact">Pending Contact</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Unreachable / Disqualified">Unreachable / Disqualified</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Outreach Channel
                </label>
                <select
                  value={outreachChannel}
                  onChange={(e) => setOutreachChannel(e.target.value as OutreachChannel)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                >
                  <option value="Phone">Phone Call</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Email">Discovery Email</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Outreach &amp; Discovery Notes
              </label>
              <textarea
                rows={3}
                value={outreachNotes}
                onChange={(e) => setOutreachNotes(e.target.value)}
                placeholder="Log call summary, director feedback, or follow-up details..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveOutreach}
                disabled={savingOutreach}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {savingOutreach && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Outreach Status
              </button>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Section 4: Structured Scope Specification */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-900">
                03. Verified Client Scope Specification (Step 4)
              </h3>
              <span className="text-xs text-slate-500">
                {lead.contactStatus === 'Contacted'
                  ? lead.scopeCompleted
                    ? 'Scope recorded'
                    : 'Ready for input'
                  : 'Requires Contacted status'}
              </span>
            </div>

            {lead.contactStatus !== 'Contacted' ? (
              <p className="text-xs text-slate-500 py-3">
                Mark this lead as <strong>Contacted</strong> above to unlock the Malaysian corporate
                scope form and AI quotation generator.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Malaysian Entity Type
                    </label>
                    <select
                      value={entityType}
                      onChange={(e) => setEntityType(e.target.value as EntityType)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    >
                      {ENTITY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Current Accounting State
                    </label>
                    <select
                      value={accountingState}
                      onChange={(e) => setAccountingState(e.target.value as AccountingState)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    >
                      {ACCOUNTING_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Est. Annual Turnover (RM)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={annualTurnoverMyr}
                      onChange={(e) => setAnnualTurnoverMyr(e.target.value)}
                      placeholder="e.g. 2500000"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Monthly Bank Transactions
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={monthlyBankTxCount}
                      onChange={(e) => setMonthlyBankTxCount(e.target.value)}
                      placeholder="e.g. 150"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Total Headcount (Payroll)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={headcount}
                      onChange={(e) => setHeadcount(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div className="flex items-end pb-2">
                    <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sstRegistered}
                        onChange={(e) => setSstRegistered(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      SST Registered Entity (SST-02 required)
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Required Service Breakdown
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DEPARTMENTS.map((dept) => {
                      const active = serviceLines.includes(dept);
                      return (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => toggleService(dept)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {DEPARTMENT_LABELS[dept]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    PIC Verified Discovery Scope Notes
                  </label>
                  <textarea
                    rows={4}
                    value={scopeNotes}
                    onChange={(e) => setScopeNotes(e.target.value)}
                    placeholder="Document exact retainers, backlog catch-up period, audit exemption eligibility, CP204/Form C needs, and special client deliverables..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveScope}
                    disabled={savingScope || generatingQuote}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingScope ? 'Saving Scope...' : 'Save Scope Draft'}
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateQuotation}
                    disabled={generatingQuote || savingScope}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {generatingQuote ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating MYR Quotation...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate AI Quotation (Step 6)
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
