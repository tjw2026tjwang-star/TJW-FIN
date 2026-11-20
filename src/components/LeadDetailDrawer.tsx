import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Calculator,
  Check,
  FileText,
  X,
} from 'lucide-react';
import {
  ACCOUNTING_STATES,
  DEPARTMENTS,
  DEPARTMENT_FULL_NAMES,
  TURNOVER_TIERS,
  type AccountingState,
  type ContactStatus,
  type Department,
  type Lead,
  type LeadScope,
  type OutreachChannel,
  type Quotation,
  type TurnoverTierId,
} from '../types';
import { evaluateLeadSla, formatDateTime, formatMyr } from '../lib/sla';

interface LeadDetailDrawerProps {
  lead: Lead | null;
  linkedQuotation?: Quotation;
  onClose: () => void;
  onUpdateOutreach: (
    leadId: string,
    payload: {
      contactStatus: ContactStatus;
      outreachChannel: OutreachChannel;
      outreachNotes: string;
    }
  ) => void;
  onLogSlaReminder: (leadId: string) => void;
  onSaveScope: (leadId: string, scope: Omit<LeadScope, 'completed' | 'updatedAt'>) => void;
  onGenerateQuotation: (leadId: string, scope: Omit<LeadScope, 'completed' | 'updatedAt'>) => void;
  onOpenQuotation: (quotationId: string) => void;
}

const STEPS = [
  { key: 'Triage', label: '1. Triage' },
  { key: 'Outreach', label: '2–3. Contact & SLA' },
  { key: 'Scope', label: '4. Scope' },
  { key: 'Quotation', label: '6. Quote' },
  { key: 'Approval', label: '7. Approval' },
  { key: 'Dispatched', label: '8. Dispatched' },
] as const;

function stageOrder(stage: Lead['workflowStage']): number {
  const idx = STEPS.findIndex((s) => s.key === stage);
  return idx === -1 ? 1 : idx;
}

export function LeadDetailDrawer({
  lead,
  linkedQuotation,
  onClose,
  onUpdateOutreach,
  onLogSlaReminder,
  onSaveScope,
  onGenerateQuotation,
  onOpenQuotation,
}: LeadDetailDrawerProps) {
  const [contactStatus, setContactStatus] = useState<ContactStatus>('Pending Contact');
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel>('Phone');
  const [outreachNotes, setOutreachNotes] = useState('');

  // Step 4 Scope fields
  const [turnoverTier, setTurnoverTier] = useState<TurnoverTierId | ''>('500k_2m');
  const [annualTurnoverMyr, setAnnualTurnoverMyr] = useState('');
  const [monthlyTransactionVolume, setMonthlyTransactionVolume] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [sstRegistered, setSstRegistered] = useState(false);
  const [requiresIncorporation, setRequiresIncorporation] = useState(false);
  const [accountingState, setAccountingState] = useState<AccountingState>('Up-to-date');
  const [requestedServices, setRequestedServices] = useState<Department[]>([]);
  const [scopeNotes, setScopeNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) return;
    setContactStatus(lead.contactStatus);
    setOutreachChannel(lead.outreachChannel || 'Phone');
    setOutreachNotes(lead.outreachNotes || '');

    setTurnoverTier(lead.scope.turnoverTier || '500k_2m');
    setAnnualTurnoverMyr(
      lead.scope.annualTurnoverMyr ? String(lead.scope.annualTurnoverMyr) : ''
    );
    setMonthlyTransactionVolume(
      lead.scope.monthlyTransactionVolume ? String(lead.scope.monthlyTransactionVolume) : ''
    );
    setHeadcount(lead.scope.headcount ? String(lead.scope.headcount) : '');
    setSstRegistered(Boolean(lead.scope.sstRegistered));
    setRequiresIncorporation(Boolean(lead.scope.requiresIncorporation));
    setAccountingState(lead.scope.accountingState || 'Up-to-date');
    setRequestedServices(
      lead.scope.requestedServices.length > 0
        ? lead.scope.requestedServices
        : Array.from(new Set([lead.targetDept, ...lead.secondaryDepts]))
    );
    setScopeNotes(lead.scope.scopeNotes || '');
    setFeedback(null);
  }, [lead]);

  if (!lead) return null;

  const sla = evaluateLeadSla(lead);
  const currentStageIdx = stageOrder(lead.workflowStage);

  const handleTurnoverTierChange = (tierId: TurnoverTierId) => {
    setTurnoverTier(tierId);
    const tier = TURNOVER_TIERS.find((t) => t.id === tierId);
    if (tier && !annualTurnoverMyr) {
      setAnnualTurnoverMyr(String(tier.numericValue));
    }
  };

  const toggleService = (dept: Department) => {
    setRequestedServices((prev) => {
      if (prev.includes(dept)) {
        return prev.length > 1 ? prev.filter((d) => d !== dept) : prev;
      }
      return [...prev, dept];
    });
  };

  const collectScopePayload = (): Omit<LeadScope, 'completed' | 'updatedAt'> => {
    const tier = TURNOVER_TIERS.find((t) => t.id === turnoverTier);
    return {
      turnoverTier,
      annualTurnoverMyr: Number(annualTurnoverMyr) || tier?.numericValue || 0,
      monthlyTransactionVolume: Math.max(0, Math.floor(Number(monthlyTransactionVolume) || 0)),
      headcount: Math.max(0, Math.floor(Number(headcount) || 0)),
      sstRegistered,
      requiresIncorporation,
      accountingState,
      requestedServices: requestedServices.length > 0 ? requestedServices : [lead.targetDept],
      scopeNotes: scopeNotes.trim(),
    };
  };

  const handleSaveOutreachClick = () => {
    onUpdateOutreach(lead.id, {
      contactStatus,
      outreachChannel,
      outreachNotes: outreachNotes.trim(),
    });
    setFeedback(
      contactStatus === 'Contacted'
        ? 'Lead marked Contacted. First-contact timestamp recorded and SLA timer frozen.'
        : `Contact status updated to "${contactStatus}".`
    );
  };

  const handleSaveScopeClick = () => {
    onSaveScope(lead.id, collectScopePayload());
    setFeedback('Step 4 client service scope logged. Ready for Step 6 quotation calculation.');
  };

  const handleGenerateClick = () => {
    onGenerateQuotation(lead.id, collectScopePayload());
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Lead workflow details for ${lead.companyName}`}
    >
      <div className="bg-white w-full max-w-2xl h-full border-l border-[#E3E3E3] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E3E3E3] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 font-mono tabular-nums">
              <span>{lead.leadCode}</span>
              <span aria-hidden="true">·</span>
              <span className="font-sans text-neutral-700 font-medium">{lead.targetDept}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-sans font-semibold ${
                  sla.isBreached ? 'text-[#CB3737]' : sla.isFrozen ? 'text-emerald-700' : 'text-neutral-700'
                }`}
              >
                {sla.label}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-[#171717] truncate mt-1">
              {lead.companyName}
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              {lead.contactPerson} ({lead.entityType})
              {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
              {lead.contactEmail ? ` · ${lead.contactEmail}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-[#171717] rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer shrink-0"
            aria-label="Close lead detail drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 8-Step Progress Bar */}
        <div className="px-6 py-2.5 bg-[#FAFAFA] border-b border-[#E3E3E3] flex items-center gap-2 overflow-x-auto">
          {STEPS.map((step, idx) => {
            const done = idx < currentStageIdx;
            const current = idx === currentStageIdx;
            return (
              <div
                key={step.key}
                className={`flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 ${
                  current
                    ? 'text-[#CB3737] font-semibold'
                    : done
                      ? 'text-emerald-700 font-medium'
                      : 'text-neutral-400'
                }`}
              >
                {done && <Check className="w-3.5 h-3.5" />}
                <span>{step.label}</span>
                {idx < STEPS.length - 1 && (
                  <span className="text-neutral-300 pl-1" aria-hidden="true">
                    /
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">
          {/* Step 5 High-Visibility SLA Breach Warning */}
          {sla.isBreached && lead.contactStatus === 'Pending Contact' && (
            <div className="p-4 bg-[#CB3737]/8 border border-[#CB3737]/30 rounded-lg flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-[#7F1D1D]">
                <AlertTriangle className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-[#CB3737]">
                    SLA BREACH / OVERDUE — {sla.workingDaysElapsed} working days elapsed (Limit: 4 working days)
                  </p>
                  <p>
                    Assigned PIC <strong>{lead.assignedPicName}</strong> has not logged prospect contact.
                    {lead.escalationRemindersSent > 0 &&
                      ` Reminders logged: ${lead.escalationRemindersSent} (last ${formatDateTime(lead.lastReminderAt)}).`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onLogSlaReminder(lead.id);
                  setFeedback('SLA escalation reminder logged for assigned PIC.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5" />
                Send PIC Reminder
              </button>
            </div>
          )}

          {feedback && (
            <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
              {feedback}
            </div>
          )}

          {/* Linked Quotation Banner */}
          {linkedQuotation && (
            <div className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-neutral-500">
                  Linked Quotation · {linkedQuotation.status}
                  {linkedQuotation.isApproved ? ' (Administrator Approved)' : ' (Awaiting Approval)'}
                </p>
                <p className="text-sm font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                  {linkedQuotation.quoteNumber} · Year-1 {formatMyr(linkedQuotation.totalYearOneMyr)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenQuotation(linkedQuotation.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Open in Quotation Workbench
              </button>
            </div>
          )}

          {/* Step 1 & 2 Assignment Overview */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#171717]">
                01. Inquiry Brief &amp; PIC Assignment
              </h3>
              <span className="text-xs font-mono tabular-nums text-neutral-500">
                received_at: {formatDateTime(lead.receivedAt)}
              </span>
            </div>
            <p className="text-sm text-neutral-700 leading-relaxed">
              {lead.inquiryNotes || 'No additional inquiry notes entered.'}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>Assigned PIC: <strong className="text-neutral-800">{lead.assignedPicName}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Target Dept: <strong className="text-neutral-800">{DEPARTMENT_FULL_NAMES[lead.targetDept]}</strong></span>
              {lead.secondaryDepts.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Secondary: {lead.secondaryDepts.join(', ')}</span>
                </>
              )}
            </div>
          </section>

          <hr className="border-[#E3E3E3]" />

          {/* Step 2 & 3: PIC Lead Contact Log & 4-Working-Day SLA Tracker */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#171717]">
                02. PIC Contact Log &amp; 4-Working-Day SLA Tracker (Steps 2–3)
              </h3>
              {lead.firstContactAt && (
                <span className="text-xs font-mono tabular-nums text-emerald-700 font-medium">
                  first_contact_at: {formatDateTime(lead.firstContactAt)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Contact Status
                </label>
                <select
                  value={contactStatus}
                  onChange={(e) => setContactStatus(e.target.value as ContactStatus)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                >
                  <option value="Pending Contact">Pending Contact</option>
                  <option value="Contacted">Contacted (Freeze SLA Timer)</option>
                  <option value="Unreachable">Unreachable</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Outreach Channel
                </label>
                <select
                  value={outreachChannel}
                  onChange={(e) => setOutreachChannel(e.target.value as OutreachChannel)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                >
                  <option value="Phone">Phone Call</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Email">Email</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                PIC Outreach Notes
              </label>
              <textarea
                rows={2}
                value={outreachNotes}
                onChange={(e) => setOutreachNotes(e.target.value)}
                placeholder="Log call outcome, prospect availability, or follow-up date..."
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveOutreachClick}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
              >
                Save Contact Status
              </button>
            </div>
          </section>

          <hr className="border-[#E3E3E3]" />

          {/* Step 4: Service Scope Logging */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#171717]">
                03. Confirmed Service Scope Logging (Step 4)
              </h3>
              <span className="text-xs text-neutral-500">
                {lead.contactStatus === 'Contacted'
                  ? lead.scope.completed
                    ? 'Scope Confirmed'
                    : 'Ready for input'
                  : 'Requires Contacted status'}
              </span>
            </div>

            {lead.contactStatus !== 'Contacted' ? (
              <p className="text-xs text-neutral-500 py-2">
                Update contact status to <strong>Contacted</strong> above to freeze the 4-day SLA
                clock and unlock Step 4 service scope logging &amp; Step 6 quotation generation.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Annual Turnover / Revenue Tier
                    </label>
                    <select
                      value={turnoverTier}
                      onChange={(e) => handleTurnoverTierChange(e.target.value as TurnoverTierId)}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                    >
                      {TURNOVER_TIERS.map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          {tier.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Exact Est. Annual Turnover (RM)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={annualTurnoverMyr}
                      onChange={(e) => setAnnualTurnoverMyr(e.target.value)}
                      placeholder="e.g. 2500000"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Monthly Invoice &amp; Transaction Volume
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={monthlyTransactionVolume}
                      onChange={(e) => setMonthlyTransactionVolume(e.target.value)}
                      placeholder="e.g. 120"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Headcount for Payroll
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={headcount}
                      onChange={(e) => setHeadcount(e.target.value)}
                      placeholder="e.g. 15"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Accounting State
                    </label>
                    <select
                      value={accountingState}
                      onChange={(e) => setAccountingState(e.target.value as AccountingState)}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                    >
                      {ACCOUNTING_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col justify-center gap-2 pt-2">
                    <label className="inline-flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sstRegistered}
                        onChange={(e) => setSstRegistered(e.target.checked)}
                        className="w-4 h-4 rounded border-[#E3E3E3] accent-[#CB3737]"
                      />
                      SST Registered (Include SST-02 compliance)
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requiresIncorporation}
                        onChange={(e) => setRequiresIncorporation(e.target.checked)}
                        className="w-4 h-4 rounded border-[#E3E3E3] accent-[#CB3737]"
                      />
                      New Entity Incorporation required (One-off setup)
                    </label>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-neutral-700 mb-1.5">
                    Specific Services Requested
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DEPARTMENTS.map((dept) => {
                      const active = requestedServices.includes(dept);
                      return (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => toggleService(dept)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#EE6F57] text-white border-[#EE6F57]'
                              : 'bg-white text-neutral-700 border-[#E3E3E3] hover:border-neutral-400'
                          }`}
                        >
                          {dept}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Confirmed Client Scope Specifications
                  </label>
                  <textarea
                    rows={3}
                    value={scopeNotes}
                    onChange={(e) => setScopeNotes(e.target.value)}
                    placeholder="Document exact filing periods, financial year-end, backlog months, or payroll cutoffs..."
                    className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveScopeClick}
                    className="px-4 py-2 text-xs font-medium text-neutral-700 bg-white border border-[#E3E3E3] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    Save Scope Only
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateClick}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    Generate MYR Quotation (Step 6)
                    <ArrowRight className="w-3.5 h-3.5" />
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
