import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  DEPARTMENTS,
  type BillingFrequency,
  type Department,
  type DispatchChannel,
  type Lead,
  type Quotation,
  type QuotationLineItem,
  type QuotationStatus,
  type UserSession,
} from '../types';
import { computeQuotationTotals } from '../lib/pricing';
import {
  computeValidityDaysFromDates,
  computeValidUntilDate,
  DEFAULT_VALIDITY_DAYS,
  formatDateTime,
  formatMyr,
  generateSafeId,
} from '../lib/sla';
import {
  buildEmailProposal,
  buildWhatsAppProposal,
  downloadQuotationPdf,
} from '../lib/pdf';

interface QuotationWorkbenchProps {
  quotations: Quotation[];
  leadsById: Record<string, Lead>;
  selectedQuotationId: string | null;
  onSelectQuotation: (id: string) => void;
  session: UserSession;
  onUpdateQuotationContent: (
    quotationId: string,
    payload: {
      lineItems: QuotationLineItem[];
      legalRemarks: string;
      assumptions: string;
      exclusions: string;
    }
  ) => void;
  onToggleApproval: (quotationId: string, approved: boolean) => void;
  onAmendValidity: (quotationId: string, validityDays: number, validUntil: string) => void;
  onDispatchQuotation: (quotationId: string, channel: Exclude<DispatchChannel, ''>) => void;
}

export function QuotationWorkbench({
  quotations,
  leadsById,
  selectedQuotationId,
  onSelectQuotation,
  session,
  onUpdateQuotationContent,
  onToggleApproval,
  onAmendValidity,
  onDispatchQuotation,
}: QuotationWorkbenchProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | QuotationStatus>('All');
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const [legalRemarks, setLegalRemarks] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Admin-only validity amendment state
  const [amendingValidity, setAmendingValidity] = useState(false);
  const [draftValidityDays, setDraftValidityDays] = useState<number>(DEFAULT_VALIDITY_DAYS);
  const [draftValidUntil, setDraftValidUntil] = useState<string>('');

  const filteredQuotations = useMemo(() => {
    if (statusFilter === 'All') return quotations;
    return quotations.filter((q) => q.status === statusFilter);
  }, [quotations, statusFilter]);

  const selected = useMemo(() => {
    if (selectedQuotationId) {
      const match = quotations.find((q) => q.id === selectedQuotationId);
      if (match) return match;
    }
    return filteredQuotations[0] || quotations[0] || null;
  }, [quotations, filteredQuotations, selectedQuotationId]);

  const linkedLead = selected ? leadsById[selected.leadId] : undefined;

  useEffect(() => {
    if (!selected) {
      setLineItems([]);
      setAmendingValidity(false);
      return;
    }
    const vDays = selected.validityDays || DEFAULT_VALIDITY_DAYS;
    const vUntil = selected.validUntil || computeValidUntilDate(selected.createdAt, vDays);
    setLineItems(selected.lineItems);
    setLegalRemarks(selected.legalRemarks);
    setAssumptions(selected.assumptions);
    setExclusions(selected.exclusions);
    setDraftValidityDays(vDays);
    setDraftValidUntil(vUntil);
    setAmendingValidity(false);
    setHasUnsavedEdits(false);
    setBanner(null);
  }, [selected?.id, selected?.updatedAt]);

  const liveTotals = useMemo(() => computeQuotationTotals(lineItems), [lineItems]);

  const isDispatched = selected?.status === 'Dispatched';
  const isLockedFromEdit = isDispatched;
  const isAdministrator = session.role === 'Administrator';

  const activeValidityDays = selected?.validityDays || DEFAULT_VALIDITY_DAYS;
  const activeValidUntil = selected
    ? selected.validUntil || computeValidUntilDate(selected.createdAt, activeValidityDays)
    : '';

  const handleValidityDaysInput = (daysRaw: number) => {
    if (!selected) return;
    const safeDays = Math.max(1, Math.min(365, Math.floor(daysRaw || 1)));
    setDraftValidityDays(safeDays);
    setDraftValidUntil(computeValidUntilDate(selected.createdAt, safeDays));
  };

  const handleValidUntilInput = (ymd: string) => {
    if (!selected) return;
    setDraftValidUntil(ymd);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setDraftValidityDays(computeValidityDaysFromDates(selected.createdAt, ymd));
    }
  };

  const handleSaveValidityAmendment = () => {
    if (!selected || !isAdministrator || !draftValidUntil) return;
    onAmendValidity(selected.id, draftValidityDays, draftValidUntil);
    setAmendingValidity(false);
    setBanner(
      `Quotation validity amended to ${draftValidityDays} days (valid until ${draftValidUntil}) and recorded in the Audit Log.`
    );
  };

  const updateItem = (idx: number, patch: Partial<QuotationLineItem>) => {
    if (isLockedFromEdit) return;
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        const qty = Math.max(1, Math.floor(Number(next.quantity) || 1));
        const unit = Math.max(0, Number(next.unitPriceMyr) || 0);
        return {
          ...next,
          quantity: qty,
          unitPriceMyr: unit,
          lineTotalMyr: Math.round(qty * unit * 100) / 100,
        };
      })
    );
    setHasUnsavedEdits(true);
  };

  const addLineItem = () => {
    if (isLockedFromEdit || !selected) return;
    setLineItems((prev) => [
      ...prev,
      {
        id: generateSafeId('li'),
        dept: selected.targetDept,
        description: '',
        deliverables: '',
        frequency: 'One-off',
        quantity: 1,
        unitPriceMyr: 0,
        lineTotalMyr: 0,
      },
    ]);
    setHasUnsavedEdits(true);
  };

  const removeLineItem = (idx: number) => {
    if (isLockedFromEdit) return;
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
    setHasUnsavedEdits(true);
  };

  const handleSaveEdits = () => {
    if (!selected || isLockedFromEdit) return;
    onUpdateQuotationContent(selected.id, {
      lineItems,
      legalRemarks,
      assumptions,
      exclusions,
    });
    setHasUnsavedEdits(false);
    setBanner('Quotation line items and fee totals saved.');
  };

  const previewQuotation: Quotation | null = selected
    ? {
        ...selected,
        lineItems,
        ...liveTotals,
        legalRemarks,
        assumptions,
        exclusions,
      }
    : null;

  const whatsappPreview = useMemo(() => {
    if (!previewQuotation) return null;
    return buildWhatsAppProposal(previewQuotation, linkedLead);
  }, [previewQuotation, linkedLead]);

  const handleDispatch = async (channel: 'Email' | 'WhatsApp') => {
    if (!selected || !previewQuotation || !selected.isApproved) return;
    if (hasUnsavedEdits && !isDispatched) {
      onUpdateQuotationContent(selected.id, {
        lineItems,
        legalRemarks,
        assumptions,
        exclusions,
      });
      setHasUnsavedEdits(false);
    }

    if (channel === 'Email') {
      downloadQuotationPdf(previewQuotation, linkedLead);
      const emailDraft = buildEmailProposal(previewQuotation, linkedLead);
      const a = document.createElement('a');
      a.href = emailDraft.mailtoUrl;
      a.click();
    } else if (whatsappPreview) {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(whatsappPreview.message);
        setCopiedMsg(true);
        setTimeout(() => setCopiedMsg(false), 2600);
      }
    }

    if (selected.status !== 'Dispatched') {
      onDispatchQuotation(selected.id, channel);
    }
    setBanner(
      channel === 'Email'
        ? 'Approved quotation dispatched via Email + PDF. Line items are now permanently locked.'
        : 'Approved WhatsApp proposal copied and marked Dispatched. Line items are now permanently locked.'
    );
  };

  const statusTone = (status: QuotationStatus) => {
    if (status === 'Dispatched') return 'text-[#171717] font-semibold';
    if (status === 'Approved') return 'text-emerald-700 font-semibold';
    return 'text-[#EE6F57] font-semibold';
  };

  return (
    <div className="space-y-5">
      {/* Status filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#E3E3E3] rounded-lg overflow-x-auto">
          {(['All', 'Pending Approval', 'Approved', 'Dispatched'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab
                  ? 'bg-[#CB3737] text-white'
                  : 'text-neutral-600 hover:text-[#171717]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <span className="text-xs text-neutral-500 font-mono tabular-nums">
          {filteredQuotations.length} quotation{filteredQuotations.length === 1 ? '' : 's'}
        </span>
      </div>

      {filteredQuotations.length === 0 ? (
        <div className="bg-white border border-[#E3E3E3] rounded-xl p-12 text-center space-y-2">
          <p className="text-sm font-semibold text-[#171717]">
            {quotations.length === 0
              ? 'No quotations generated yet'
              : `No quotations in "${statusFilter}" status`}
          </p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
            Open a contacted lead in the Leads Pipeline, log confirmed Step 4 service scope
            specifications, and run the Step 6 Malaysian SME quotation engine to generate a draft.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Quotation List */}
          <div className="xl:col-span-4 bg-white border border-[#E3E3E3] rounded-xl divide-y divide-[#E3E3E3] overflow-hidden">
            {filteredQuotations.map((q) => {
              const active = selected?.id === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelectQuotation(q.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    active ? 'bg-[#FAFAFA]' : 'bg-white hover:bg-[#FAFAFA]/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-neutral-500 tabular-nums">{q.quoteNumber}</span>
                    <span className={statusTone(q.status)}>{q.status}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#171717] truncate mt-1">
                    {q.companyName}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 mt-1.5 font-mono tabular-nums">
                    <span>Year-1 {formatMyr(q.totalYearOneMyr)}</span>
                    <span className="font-sans">
                      {q.isApproved ? 'Approved' : 'Approval Pending'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Interactive Quotation Editor & Approval/Dispatch Gate */}
          {selected && previewQuotation && (
            <div className="xl:col-span-8 bg-white border border-[#E3E3E3] rounded-xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-5 border-b border-[#E3E3E3] flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 font-mono tabular-nums">
                    <span>{selected.quoteNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-sans ${statusTone(selected.status)}`}>
                      {selected.status}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans text-neutral-600">{selected.targetDept}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-[#171717] mt-1">
                    {selected.companyName}
                  </h2>
                  {linkedLead && (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {linkedLead.contactPerson} ({linkedLead.entityType})
                      {linkedLead.scope.annualTurnoverMyr > 0
                        ? ` · Turnover ${formatMyr(linkedLead.scope.annualTurnoverMyr)}`
                        : ''}
                      {linkedLead.scope.headcount > 0
                        ? ` · ${linkedLead.scope.headcount} payroll staff`
                        : ''}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => downloadQuotationPdf(previewQuotation, linkedLead)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-[#E3E3E3] rounded-lg hover:bg-[#FAFAFA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {selected.isApproved ? 'Download Approved PDF' : 'Download Draft PDF'}
                </button>
              </div>

              <div className="p-6 space-y-6">
                {banner && (
                  <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                    {banner}
                  </div>
                )}

                {/* Fee Subtotals Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-[#E3E3E3]">
                  <div>
                    <p className="text-xs text-neutral-500">Setup Fee Total</p>
                    <p className="text-base font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalSetupFeeMyr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Monthly Recurring</p>
                    <p className="text-base font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalMonthlyRecurringMyr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Annual Recurring</p>
                    <p className="text-base font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalAnnualRecurringMyr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Est. Year-1 Total</p>
                    <p className="text-base font-bold text-[#CB3737] font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalYearOneMyr)}
                    </p>
                  </div>
                </div>

                {/* Quotation Validity & Administrator-Only Amendment Control */}
                <section className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <CalendarClock className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-[#171717]">
                          Quotation Validity Period
                        </p>
                        <p className="text-xs text-neutral-600 mt-0.5 font-mono tabular-nums">
                          {activeValidityDays} days · Valid until{' '}
                          <strong className="text-[#171717]">{activeValidUntil}</strong>
                        </p>
                      </div>
                    </div>

                    {isAdministrator ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftValidityDays(activeValidityDays);
                          setDraftValidUntil(activeValidUntil);
                          setAmendingValidity((v) => !v);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#CB3737] bg-white border border-[#CB3737]/40 hover:bg-[#CB3737] hover:text-white rounded-md transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        {amendingValidity ? 'Close Editor' : 'Amend Validity'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled
                          title="Only Administrators are authorized to amend quotation validity"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 bg-white border border-[#E3E3E3] rounded-md cursor-not-allowed whitespace-nowrap"
                        >
                          <Lock className="w-3 h-3" />
                          Amend Validity (Admin Only)
                        </button>
                      </div>
                    )}
                  </div>

                  {!isAdministrator && (
                    <p className="text-[11px] text-neutral-500">
                      Read-only display for Standard User role. Only Administrators can extend or
                      adjust quotation validity dates.
                    </p>
                  )}

                  {isAdministrator && amendingValidity && (
                    <div className="pt-3 border-t border-[#E3E3E3] space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-neutral-500 mr-1">
                          Quick Presets:
                        </span>
                        {[14, 30, 60, 90].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleValidityDaysInput(preset)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                              draftValidityDays === preset
                                ? 'bg-[#CB3737] text-white border-[#CB3737]'
                                : 'bg-white text-neutral-700 border-[#E3E3E3] hover:border-neutral-400'
                            }`}
                          >
                            {preset} days
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                            Custom Validity (Days)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={draftValidityDays}
                            onChange={(e) => handleValidityDaysInput(Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-white border border-[#E3E3E3] rounded-md focus:outline-none focus:border-[#CB3737]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                            Valid Until Date (`valid_until`)
                          </label>
                          <input
                            type="date"
                            value={draftValidUntil}
                            onChange={(e) => handleValidUntilInput(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-white border border-[#E3E3E3] rounded-md focus:outline-none focus:border-[#CB3737]"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAmendingValidity(false)}
                          className="px-3 py-1.5 text-xs font-medium text-neutral-600 bg-white border border-[#E3E3E3] rounded-md hover:bg-neutral-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveValidityAmendment}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-md transition-colors cursor-pointer"
                        >
                          Save Validity Amendment
                        </button>
                      </div>
                    </div>
                  )}

                  {selected.validityAmendments && selected.validityAmendments.length > 0 && (
                    <div className="pt-2.5 border-t border-[#E3E3E3] space-y-1.5">
                      <p className="text-[11px] font-semibold text-neutral-600">
                        Validity Amendment Audit Trail ({selected.validityAmendments.length})
                      </p>
                      <div className="space-y-1">
                        {selected.validityAmendments.map((am, idx) => (
                          <p
                            key={`${am.amendment_timestamp}-${idx}`}
                            className="text-[11px] text-neutral-600 leading-relaxed"
                          >
                            <span className="font-mono tabular-nums text-neutral-500">
                              {formatDateTime(am.amendment_timestamp)}
                            </span>{' '}
                            · <strong>{am.amended_by}</strong> changed{' '}
                            <span className="line-through text-neutral-400">
                              {am.previous_validity}
                            </span>{' '}
                            &rarr; <strong className="text-[#171717]">{am.new_validity}</strong>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Step 6 Interactive Line-Item Editor */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#171717]">
                        Step 6: Itemized MYR Fee Schedule
                      </h3>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Baselines: Co Sec RM 60–120/mo · Inc RM 1.5k–2.5k · Acc RM 300–1.5k/mo ·
                        Payroll RM 30–50/emp · Tax RM 1.2k–3.5k/yr · Audit RM 2.5k–8k+/yr ·
                        Finance RM 800–3k/mo or RM 2k–5k project
                      </p>
                    </div>
                    {!isLockedFromEdit ? (
                      <button
                        type="button"
                        onClick={addLineItem}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#CB3737] bg-[#CB3737]/5 hover:bg-[#CB3737]/10 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Line Item
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-neutral-500 font-medium">
                        <Lock className="w-3.5 h-3.5" />
                        Locked after dispatch
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-[#E3E3E3] rounded-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FAFAFA] border-b border-[#E3E3E3] text-xs font-medium text-neutral-500">
                          <th className="py-2.5 px-3">Dept</th>
                          <th className="py-2.5 px-3">Service &amp; Deliverables</th>
                          <th className="py-2.5 px-3">Cycle</th>
                          <th className="py-2.5 px-3 text-right">Qty</th>
                          <th className="py-2.5 px-3 text-right">Rate (RM)</th>
                          <th className="py-2.5 px-3 text-right">Total (RM)</th>
                          {!isLockedFromEdit && <th className="py-2.5 px-2 w-8" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E3E3] text-xs">
                        {lineItems.map((item, idx) => (
                          <tr key={item.id} className="align-top">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {!isLockedFromEdit ? (
                                <select
                                  value={item.dept}
                                  onChange={(e) =>
                                    updateItem(idx, { dept: e.target.value as Department })
                                  }
                                  className="px-2 py-1 text-xs border border-[#E3E3E3] rounded bg-white"
                                >
                                  {DEPARTMENTS.map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="font-medium text-neutral-700">{item.dept}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 min-w-[210px]">
                              {!isLockedFromEdit ? (
                                <div className="space-y-1.5">
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) =>
                                      updateItem(idx, { description: e.target.value })
                                    }
                                    placeholder="Service line title"
                                    className="w-full px-2 py-1 text-xs font-medium border border-[#E3E3E3] rounded"
                                  />
                                  <input
                                    type="text"
                                    value={item.deliverables}
                                    onChange={(e) =>
                                      updateItem(idx, { deliverables: e.target.value })
                                    }
                                    placeholder="Deliverables included"
                                    className="w-full px-2 py-1 text-xs text-neutral-600 border border-[#E3E3E3] rounded"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium text-[#171717]">{item.description}</p>
                                  {item.deliverables && (
                                    <p className="text-neutral-500 mt-0.5">{item.deliverables}</p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {!isLockedFromEdit ? (
                                <select
                                  value={item.frequency}
                                  onChange={(e) =>
                                    updateItem(idx, {
                                      frequency: e.target.value as BillingFrequency,
                                    })
                                  }
                                  className="px-2 py-1 text-xs border border-[#E3E3E3] rounded bg-white"
                                >
                                  <option value="One-off">One-off</option>
                                  <option value="Monthly">Monthly</option>
                                  <option value="Annual">Annual</option>
                                </select>
                              ) : (
                                <span className="text-neutral-600">{item.frequency}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {!isLockedFromEdit ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateItem(idx, {
                                      quantity: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                  className="w-16 px-2 py-1 text-right text-xs border border-[#E3E3E3] rounded"
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {!isLockedFromEdit ? (
                                <input
                                  type="number"
                                  min={0}
                                  step="10"
                                  value={item.unitPriceMyr}
                                  onChange={(e) =>
                                    updateItem(idx, {
                                      unitPriceMyr: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className="w-24 px-2 py-1 text-right text-xs border border-[#E3E3E3] rounded"
                                />
                              ) : (
                                item.unitPriceMyr.toLocaleString('en-MY', {
                                  minimumFractionDigits: 2,
                                })
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#171717] tabular-nums whitespace-nowrap">
                              {item.lineTotalMyr.toLocaleString('en-MY', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            {!isLockedFromEdit && (
                              <td className="py-2.5 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeLineItem(idx)}
                                  className="p-1 text-neutral-400 hover:text-[#CB3737] cursor-pointer"
                                  aria-label="Remove line item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Terms, Assumptions, Exclusions */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">
                        Legal Remarks &amp; Terms
                      </label>
                      <textarea
                        rows={2}
                        disabled={isLockedFromEdit}
                        value={legalRemarks}
                        onChange={(e) => {
                          setLegalRemarks(e.target.value);
                          setHasUnsavedEdits(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-[#E3E3E3] rounded-lg disabled:bg-[#FAFAFA] disabled:text-neutral-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">
                        Scoping Assumptions
                      </label>
                      <textarea
                        rows={2}
                        disabled={isLockedFromEdit}
                        value={assumptions}
                        onChange={(e) => {
                          setAssumptions(e.target.value);
                          setHasUnsavedEdits(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-[#E3E3E3] rounded-lg disabled:bg-[#FAFAFA] disabled:text-neutral-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">
                        Out-of-Scope Exclusions
                      </label>
                      <textarea
                        rows={2}
                        disabled={isLockedFromEdit}
                        value={exclusions}
                        onChange={(e) => {
                          setExclusions(e.target.value);
                          setHasUnsavedEdits(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-[#E3E3E3] rounded-lg disabled:bg-[#FAFAFA] disabled:text-neutral-500"
                      />
                    </div>
                  </div>

                  {!isLockedFromEdit && hasUnsavedEdits && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveEdits}
                        className="px-4 py-2 text-xs font-semibold text-white bg-[#EE6F57] hover:bg-[#DC5E46] rounded-lg transition-colors cursor-pointer"
                      >
                        Save Line-Item Changes
                      </button>
                    </div>
                  )}
                </section>

                <hr className="border-[#E3E3E3]" />

                {/* STEP 7: APPROVAL QUEUE & ADMINISTRATOR CHECKBOX GATE */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[#171717] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#CB3737]" />
                      Step 7: Quotation Approval Gate
                    </h3>
                    {!isAdministrator && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CB3737]">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Requires Administrator Approval
                      </span>
                    )}
                  </div>

                  <div
                    className={`p-4 rounded-lg border ${
                      selected.isApproved
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : 'bg-[#FAFAFA] border-[#E3E3E3]'
                    }`}
                  >
                    <label
                      className={`flex items-start gap-3 text-xs ${
                        isAdministrator && !isDispatched
                          ? 'cursor-pointer text-[#171717]'
                          : 'cursor-not-allowed text-neutral-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.isApproved}
                        disabled={!isAdministrator || isDispatched}
                        onChange={(e) => {
                          if (!isAdministrator || isDispatched) return;
                          if (hasUnsavedEdits) {
                            onUpdateQuotationContent(selected.id, {
                              lineItems,
                              legalRemarks,
                              assumptions,
                              exclusions,
                            });
                            setHasUnsavedEdits(false);
                          }
                          onToggleApproval(selected.id, e.target.checked);
                        }}
                        className="mt-0.5 w-4 h-4 rounded border-[#E3E3E3] accent-[#CB3737] disabled:opacity-50"
                      />
                      <div className="space-y-1">
                        <p className="font-semibold text-[#171717]">
                          Quotation Approval (`is_approved = {selected.isApproved ? 'true' : 'false'}`)
                        </p>
                        {selected.isApproved ? (
                          <p className="text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Approved by <strong>{selected.approvedBy}</strong> at{' '}
                              <span className="font-mono tabular-nums">
                                {formatDateTime(selected.approvedAt)}
                              </span>
                              .
                            </span>
                          </p>
                        ) : isAdministrator ? (
                          <p className="text-neutral-600">
                            Tick this box as Administrator to stamp `approved_by` and `approved_at`
                            and unlock Step 8 client proposal dispatch.
                          </p>
                        ) : (
                          <p className="text-[#CB3737] font-medium">
                            Requires Administrator Approval — You are signed in as User. Switch to
                            an Administrator session to authorize this quotation.
                          </p>
                        )}
                      </div>
                    </label>
                  </div>
                </section>

                <hr className="border-[#E3E3E3]" />

                {/* STEP 8: GATED DISPATCH */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#171717] flex items-center gap-2">
                      {selected.isApproved ? (
                        <Send className="w-4 h-4 text-[#CB3737]" />
                      ) : (
                        <Lock className="w-4 h-4 text-neutral-400" />
                      )}
                      Step 8: Send Quotation to Lead (Gated Dispatch)
                    </h3>
                    {selected.dispatchedAt && (
                      <span className="text-xs font-mono tabular-nums text-emerald-700 font-medium">
                        Dispatched via {selected.dispatchChannel} ·{' '}
                        {formatDateTime(selected.dispatchedAt)}
                      </span>
                    )}
                  </div>

                  {!selected.isApproved && (
                    <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg flex items-center gap-2.5 text-xs text-neutral-600">
                      <Lock className="w-4 h-4 text-[#CB3737] shrink-0" />
                      <span>
                        <strong>Dispatch Locked:</strong> Sending to the client via Email or
                        WhatsApp is strictly disabled until an Administrator ticks Quotation
                        Approval above.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!selected.isApproved}
                      onClick={() => handleDispatch('Email')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Send Quotation via Email + PDF
                    </button>

                    <button
                      type="button"
                      disabled={!selected.isApproved}
                      onClick={() => handleDispatch('WhatsApp')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#171717] bg-white border border-[#E3E3E3] hover:bg-[#FAFAFA] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#EE6F57]" />
                      {copiedMsg
                        ? 'Copied & Marked Dispatched'
                        : 'Send Quotation via WhatsApp'}
                    </button>

                    {selected.isApproved && whatsappPreview && (
                      <a
                        href={whatsappPreview.waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg hover:bg-neutral-100 transition-colors"
                      >
                        Open wa.me
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {selected.isApproved && whatsappPreview && (
                    <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-600">
                          Client Dispatch Message Preview
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.clipboard) {
                              void navigator.clipboard.writeText(whatsappPreview.message);
                              setCopiedMsg(true);
                              setTimeout(() => setCopiedMsg(false), 2200);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-[#171717] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </button>
                      </div>
                      <pre className="text-xs text-neutral-700 whitespace-pre-wrap font-sans leading-relaxed max-h-36 overflow-y-auto">
                        {whatsappPreview.message}
                      </pre>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
