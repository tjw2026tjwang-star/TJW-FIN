import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  SERVICE_CATEGORIES,
  type BillingFrequency,
  type Lead,
  type Quotation,
  type QuotationLineItem,
  type QuotationStatus,
  type ServiceCategory,
  type UserProfile,
} from '../types';
import { computeQuotationTotals, formatDateTime, formatMyr } from '../lib/sla';
import {
  approveQuotation,
  dispatchQuotation,
  fetchQuotationLineItems,
  rejectQuotation,
  saveQuotationDraftOrSubmit,
  type EditableLineItem,
} from '../lib/firestoreService';
import {
  buildEmailProposalDraft,
  buildWhatsAppProposalSummary,
  downloadQuotationPdf,
} from '../lib/pdf';

interface QuotationWorkbenchProps {
  quotations: Quotation[];
  leadsById: Record<string, Lead>;
  selectedQuotationId: string | null;
  onSelectQuotation: (id: string) => void;
  actor: UserProfile;
  effectiveRoleView: 'pic' | 'approver' | 'admin';
  initialFilter?: 'all' | 'pending_approval';
}

export function QuotationWorkbench({
  quotations,
  leadsById,
  selectedQuotationId,
  onSelectQuotation,
  actor,
  effectiveRoleView,
  initialFilter = 'all',
}: QuotationWorkbenchProps) {
  const [statusFilter, setStatusFilter] = useState<string>(
    initialFilter === 'pending_approval' ? 'Pending Approval' : 'All'
  );
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [scopeNotes, setScopeNotes] = useState('');
  const [legalRemarks, setLegalRemarks] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [exclusions, setExclusions] = useState('');

  // Step 7 Approval state
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState('');

  // Step 8 Dispatch feedback
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [working, setWorking] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setStatusFilter(initialFilter === 'pending_approval' ? 'Pending Approval' : 'All');
  }, [initialFilter]);

  const filteredQuotations = useMemo(() => {
    if (statusFilter === 'All') return quotations;
    return quotations.filter((q) => q.status === statusFilter);
  }, [quotations, statusFilter]);

  const selectedQuotation = useMemo(() => {
    if (selectedQuotationId) {
      const found = quotations.find((q) => q.id === selectedQuotationId);
      if (found) return found;
    }
    return filteredQuotations[0] || quotations[0] || null;
  }, [quotations, filteredQuotations, selectedQuotationId]);

  const linkedLead = selectedQuotation ? leadsById[selectedQuotation.leadId] : undefined;

  useEffect(() => {
    if (!selectedQuotation) {
      setLineItems([]);
      return;
    }
    setScopeNotes(selectedQuotation.scopeNotes || '');
    setLegalRemarks(selectedQuotation.legalRemarks || '');
    setAssumptions(selectedQuotation.assumptions || '');
    setExclusions(selectedQuotation.exclusions || '');
    setApprovalChecked(false);
    setShowRejectBox(false);
    setRejectionFeedback('');
    setDeletedIds([]);
    setBanner(null);

    let cancelled = false;
    setLoadingItems(true);
    fetchQuotationLineItems(selectedQuotation.id, actor)
      .then((items) => {
        if (!cancelled) {
          setLineItems(
            items.map((item) => ({
              id: item.id,
              serviceCategory: item.serviceCategory,
              description: item.description,
              deliverables: item.deliverables,
              frequency: item.frequency,
              quantity: item.quantity,
              unitPriceMyr: item.unitPriceMyr,
            }))
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBanner({
            type: 'error',
            text: err instanceof Error ? err.message : 'Unable to load quotation line items.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedQuotation?.id, selectedQuotation?.status, actor]);

  const liveTotals = useMemo(() => computeQuotationTotals(lineItems), [lineItems]);

  const isEditable =
    selectedQuotation !== null &&
    (selectedQuotation.status === 'Draft' || selectedQuotation.status === 'Rejected');

  const canApprove =
    (actor.role === 'admin' || actor.role === 'approver') &&
    effectiveRoleView !== 'pic';

  const handleUpdateLine = (index: number, patch: Partial<EditableLineItem>) => {
    setLineItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const handleAddLine = () => {
    setLineItems((prev) => [
      ...prev,
      {
        serviceCategory: 'Advisory',
        description: '',
        deliverables: '',
        frequency: 'One-off',
        quantity: 1,
        unitPriceMyr: 0,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    const target = lineItems[index];
    if (target?.id) {
      setDeletedIds((prev) => [...prev, target.id!]);
    }
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveOrSubmit = async (submitForApproval: boolean) => {
    if (!selectedQuotation) return;
    if (lineItems.length === 0) {
      setBanner({ type: 'error', text: 'Add at least one fee line item before saving.' });
      return;
    }
    setWorking(true);
    setBanner(null);
    try {
      await saveQuotationDraftOrSubmit(
        selectedQuotation,
        { scopeNotes, legalRemarks, assumptions, exclusions },
        lineItems,
        deletedIds,
        submitForApproval,
        actor
      );
      setDeletedIds([]);
      setBanner({
        type: 'success',
        text: submitForApproval
          ? 'Quotation submitted to Finance Approval Queue (Step 7).'
          : 'Draft quotation and itemized fees saved.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save quotation.',
      });
    } finally {
      setWorking(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedQuotation || !approvalChecked) return;
    setWorking(true);
    setBanner(null);
    try {
      await approveQuotation(selectedQuotation, actor);
      setBanner({
        type: 'success',
        text: `Finance Approval recorded by ${actor.displayName}. Client proposal dispatch (Step 8) is now unlocked.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to approve quotation.',
      });
    } finally {
      setWorking(false);
    }
  };

  const handleReject = async () => {
    if (!selectedQuotation) return;
    if (!rejectionFeedback.trim()) {
      setBanner({ type: 'error', text: 'Provide amendment feedback before rejecting.' });
      return;
    }
    setWorking(true);
    setBanner(null);
    try {
      await rejectQuotation(selectedQuotation, rejectionFeedback, actor);
      setShowRejectBox(false);
      setRejectionFeedback('');
      setBanner({
        type: 'success',
        text: 'Quotation returned to Department PIC with feedback notes.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to reject quotation.',
      });
    } finally {
      setWorking(false);
    }
  };

  const resolvedLineItemsForOutput: QuotationLineItem[] = useMemo(() => {
    if (!selectedQuotation) return [];
    return lineItems.map((item, idx) => ({
      id: item.id || `tmp_${idx}`,
      quotationId: selectedQuotation.id,
      serviceCategory: item.serviceCategory,
      description: item.description,
      deliverables: item.deliverables,
      frequency: item.frequency,
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitPriceMyr: Number(item.unitPriceMyr) || 0,
      lineTotalMyr: Math.max(1, Number(item.quantity) || 1) * (Number(item.unitPriceMyr) || 0),
      assignedPicId: selectedQuotation.assignedPicId,
      createdBy: selectedQuotation.createdBy,
      approverIds: selectedQuotation.approverIds,
    }));
  }, [lineItems, selectedQuotation]);

  const handleDownloadPdf = () => {
    if (!selectedQuotation) return;
    downloadQuotationPdf(
      { ...selectedQuotation, ...liveTotals, legalRemarks, assumptions, exclusions },
      linkedLead,
      resolvedLineItemsForOutput
    );
  };

  const handleDispatch = async (channel: 'Email' | 'WhatsApp') => {
    if (!selectedQuotation || !selectedQuotation.isApproved) return;
    setWorking(true);
    setBanner(null);
    try {
      if (channel === 'Email') {
        downloadQuotationPdf(selectedQuotation, linkedLead, resolvedLineItemsForOutput);
        const draft = buildEmailProposalDraft(selectedQuotation, linkedLead, resolvedLineItemsForOutput);
        const a = document.createElement('a');
        a.href = draft.mailtoUrl;
        a.click();
      } else {
        const { message } = buildWhatsAppProposalSummary(
          selectedQuotation,
          linkedLead,
          resolvedLineItemsForOutput
        );
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(message);
          setCopiedWhatsApp(true);
          setTimeout(() => setCopiedWhatsApp(false), 3000);
        }
      }

      if (selectedQuotation.status === 'Approved') {
        await dispatchQuotation(selectedQuotation, channel, actor);
      }

      setBanner({
        type: 'success',
        text:
          channel === 'Email'
            ? 'Official PDF downloaded and Email proposal dispatch logged.'
            : 'WhatsApp proposal summary copied and dispatch logged.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to dispatch quotation.',
      });
    } finally {
      setWorking(false);
    }
  };

  const statusTone = (status: QuotationStatus) => {
    switch (status) {
      case 'Approved':
        return 'text-emerald-700';
      case 'Quotation Sent':
        return 'text-slate-900';
      case 'Pending Approval':
        return 'text-amber-700';
      case 'Rejected':
        return 'text-red-700';
      default:
        return 'text-slate-500';
    }
  };

  const whatsappPreview = useMemo(() => {
    if (!selectedQuotation) return null;
    return buildWhatsAppProposalSummary(selectedQuotation, linkedLead, resolvedLineItemsForOutput);
  }, [selectedQuotation, linkedLead, resolvedLineItemsForOutput]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {['All', 'Draft', 'Pending Approval', 'Approved', 'Rejected', 'Quotation Sent'].map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            )
          )}
        </div>

        <p className="text-xs text-slate-500 font-mono tabular-nums">
          {filteredQuotations.length} quotation{filteredQuotations.length === 1 ? '' : 's'}
        </p>
      </div>

      {filteredQuotations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900">
            No quotations in {statusFilter === 'All' ? 'workspace' : `"${statusFilter}"`}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Select a contacted lead from the Lead Triage Pipeline, complete Step 4 discovery scope,
            and generate an AI-assisted Malaysian corporate fee quotation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Ledger List */}
          <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {filteredQuotations.map((q) => {
              const active = selectedQuotation?.id === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelectQuotation(q.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    active ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-medium text-slate-500 tabular-nums">
                      {q.quoteNumber}
                    </span>
                    <span className={`font-medium ${statusTone(q.status)}`}>{q.status}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate mt-1">
                    {q.companyName}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
                    <span>Year-1 {formatMyr(q.totalContractValueMyr)}</span>
                    <span className="font-sans">
                      {q.isApproved ? 'Approved Gate' : 'Unapproved'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Quotation Detail Workbench */}
          {selectedQuotation && (
            <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Top Header */}
              <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <span>{selectedQuotation.quoteNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-sans font-semibold ${statusTone(selectedQuotation.status)}`}>
                      {selectedQuotation.status}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans">
                      {selectedQuotation.isApproved
                        ? `Approved by ${selectedQuotation.approvedByName}`
                        : 'Pending Finance Sign-off'}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 mt-1">
                    {selectedQuotation.companyName}
                  </h2>
                  {linkedLead && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {linkedLead.contactPerson} · {linkedLead.entityType || 'Corporate Entity'}
                      {linkedLead.annualTurnoverMyr
                        ? ` · Turnover ${formatMyr(linkedLead.annualTurnoverMyr)}`
                        : ''}
                      {linkedLead.headcount ? ` · ${linkedLead.headcount} staff` : ''}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {selectedQuotation.isApproved ? 'Download Official PDF' : 'Download Draft PDF'}
                </button>
              </div>

              <div className="p-6 space-y-6">
                {banner && (
                  <div
                    className={`p-3.5 text-xs rounded-lg border ${
                      banner.type === 'error'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    {banner.text}
                  </div>
                )}

                {selectedQuotation.rejectionFeedback && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-1">
                    <p className="text-xs font-semibold text-red-800">
                      Finance Approver Amendment Request
                    </p>
                    <p className="text-xs text-red-700 leading-relaxed">
                      {selectedQuotation.rejectionFeedback}
                    </p>
                  </div>
                )}

                {/* Financial Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500">One-off Setup</p>
                    <p className="text-base font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalSetupMyr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Monthly Retainer</p>
                    <p className="text-base font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalMonthlyMyr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Annual Statutory</p>
                    <p className="text-base font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalAnnualMyr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Est. Year-1 Total</p>
                    <p className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                      {formatMyr(liveTotals.totalContractValueMyr)}
                    </p>
                  </div>
                </div>

                {/* Line Items Table (Step 6) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Itemized Fee Schedule (MYR)
                    </h3>
                    {isEditable && (
                      <button
                        type="button"
                        onClick={handleAddLine}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Line Item
                      </button>
                    )}
                  </div>

                  {loadingItems ? (
                    <div className="py-8 flex items-center justify-center text-xs text-slate-500 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading line items...
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Description &amp; Deliverables</th>
                            <th className="py-2.5 px-3">Cycle</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3 text-right">Unit (RM)</th>
                            <th className="py-2.5 px-3 text-right">Total (RM)</th>
                            {isEditable && <th className="py-2.5 px-2 w-8" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {lineItems.map((item, idx) => {
                            const lineTotal =
                              Math.max(1, Number(item.quantity) || 1) *
                              (Number(item.unitPriceMyr) || 0);
                            return (
                              <tr key={item.id || `new_${idx}`} className="align-top">
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {isEditable ? (
                                    <select
                                      value={item.serviceCategory}
                                      onChange={(e) =>
                                        handleUpdateLine(idx, {
                                          serviceCategory: e.target.value as ServiceCategory,
                                        })
                                      }
                                      className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                                    >
                                      {SERVICE_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="font-medium text-slate-700">
                                      {item.serviceCategory}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 min-w-[220px]">
                                  {isEditable ? (
                                    <div className="space-y-1.5">
                                      <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) =>
                                          handleUpdateLine(idx, { description: e.target.value })
                                        }
                                        placeholder="Fee item description"
                                        className="w-full px-2 py-1 text-xs font-medium border border-slate-200 rounded"
                                      />
                                      <input
                                        type="text"
                                        value={item.deliverables}
                                        onChange={(e) =>
                                          handleUpdateLine(idx, { deliverables: e.target.value })
                                        }
                                        placeholder="Deliverables included"
                                        className="w-full px-2 py-1 text-xs text-slate-600 border border-slate-200 rounded"
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <p className="font-medium text-slate-900">{item.description}</p>
                                      {item.deliverables && (
                                        <p className="text-slate-500 mt-0.5">{item.deliverables}</p>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {isEditable ? (
                                    <select
                                      value={item.frequency}
                                      onChange={(e) =>
                                        handleUpdateLine(idx, {
                                          frequency: e.target.value as BillingFrequency,
                                        })
                                      }
                                      className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                                    >
                                      <option value="One-off">One-off</option>
                                      <option value="Monthly">Monthly</option>
                                      <option value="Annual">Annual</option>
                                    </select>
                                  ) : (
                                    <span className="text-slate-600">{item.frequency}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                  {isEditable ? (
                                    <input
                                      type="number"
                                      min={1}
                                      value={item.quantity}
                                      onChange={(e) =>
                                        handleUpdateLine(idx, {
                                          quantity: Math.max(1, Number(e.target.value) || 1),
                                        })
                                      }
                                      className="w-16 px-2 py-1 text-right text-xs border border-slate-200 rounded"
                                    />
                                  ) : (
                                    item.quantity
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                  {isEditable ? (
                                    <input
                                      type="number"
                                      min={0}
                                      step="10"
                                      value={item.unitPriceMyr}
                                      onChange={(e) =>
                                        handleUpdateLine(idx, {
                                          unitPriceMyr: Math.max(0, Number(e.target.value) || 0),
                                        })
                                      }
                                      className="w-24 px-2 py-1 text-right text-xs border border-slate-200 rounded"
                                    />
                                  ) : (
                                    item.unitPriceMyr.toLocaleString('en-MY', {
                                      minimumFractionDigits: 2,
                                    })
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                  {lineTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                                </td>
                                {isEditable && (
                                  <td className="py-2.5 px-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveLine(idx)}
                                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                      aria-label="Remove line item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Scope Notes, Legal Remarks, Assumptions & Exclusions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      PIC Discovery Scope Notes
                    </label>
                    <textarea
                      rows={3}
                      disabled={!isEditable}
                      value={scopeNotes}
                      onChange={(e) => setScopeNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Legal Remarks &amp; Payment Terms
                    </label>
                    <textarea
                      rows={3}
                      disabled={!isEditable}
                      value={legalRemarks}
                      onChange={(e) => setLegalRemarks(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Key Scoping Assumptions
                    </label>
                    <textarea
                      rows={2}
                      disabled={!isEditable}
                      value={assumptions}
                      onChange={(e) => setAssumptions(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Out-of-Scope Exclusions
                    </label>
                    <textarea
                      rows={2}
                      disabled={!isEditable}
                      value={exclusions}
                      onChange={(e) => setExclusions(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>
                </div>

                {/* PIC Draft Save & Submit Actions */}
                {isEditable && (
                  <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => handleSaveOrSubmit(false)}
                      disabled={working}
                      className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveOrSubmit(true)}
                      disabled={working}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {working && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Submit for Finance Approval
                    </button>
                  </div>
                )}

                <hr className="border-slate-200" />

                {/* STEP 7: MANAGERIAL APPROVAL GATE */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-slate-700" />
                      Step 7: Finance Leadership Approval Gate
                    </h3>
                    <span
                      className={`text-xs font-mono font-medium ${
                        selectedQuotation.isApproved ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      is_approved = {selectedQuotation.isApproved ? 'TRUE' : 'FALSE'}
                    </span>
                  </div>

                  {selectedQuotation.isApproved ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-4 text-xs text-emerald-900">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>
                          Approved by <strong>{selectedQuotation.approvedByName}</strong> on{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateTime(selectedQuotation.approvedAtIso)}
                          </span>
                          . Client dispatch is authorized.
                        </span>
                      </div>
                    </div>
                  ) : selectedQuotation.status === 'Pending Approval' ? (
                    canApprove ? (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                        <label className="flex items-start gap-3 text-xs text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={approvalChecked}
                            onChange={(e) => setApprovalChecked(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          />
                          <span>
                            <strong>Finance Approver Sign-off (`is_approved`):</strong> I have
                            reviewed the client discovery scope, Malaysian advisory fee benchmarks,
                            and engagement margin, and authorize client proposal dispatch.
                          </span>
                        </label>

                        {showRejectBox && (
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <label className="block text-xs font-medium text-slate-700">
                              Revision Feedback for Department PIC
                            </label>
                            <textarea
                              rows={2}
                              value={rejectionFeedback}
                              onChange={(e) => setRejectionFeedback(e.target.value)}
                              placeholder="Specify required fee adjustments or scope clarifications..."
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          {!showRejectBox ? (
                            <button
                              type="button"
                              onClick={() => setShowRejectBox(true)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Return for Revision
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleReject}
                                disabled={working}
                                className="px-3.5 py-2 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors cursor-pointer"
                              >
                                Confirm Rejection
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowRejectBox(false)}
                                className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleApprove}
                            disabled={!approvalChecked || working}
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-40 cursor-pointer"
                          >
                            {working && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Approve Quotation &amp; Unlock Dispatch
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                        Awaiting Finance Director / Partner review. Department PICs cannot
                        self-approve quotations.
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-slate-500">
                      Submit this draft quotation above to route it into the Finance Approval Queue.
                    </p>
                  )}
                </section>

                <hr className="border-slate-200" />

                {/* STEP 8: CLIENT PROPOSAL DISPATCH (HARD GUARDRAIL) */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      {selectedQuotation.isApproved ? (
                        <Send className="w-4 h-4 text-slate-700" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-400" />
                      )}
                      Step 8: Client Proposal Dispatch
                    </h3>
                    {selectedQuotation.dispatchedAtIso && (
                      <span className="text-xs text-emerald-700 font-mono tabular-nums">
                        Sent via {selectedQuotation.dispatchChannel} ·{' '}
                        {formatDateTime(selectedQuotation.dispatchedAtIso)}
                      </span>
                    )}
                  </div>

                  {!selectedQuotation.isApproved ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3 text-xs text-slate-600">
                      <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        <strong>Dispatch Blocked (Hard Guardrail):</strong> Proposal delivery via
                        Email or WhatsApp is locked by policy and database security rules until
                        Finance Approval is confirmed (`is_approved == TRUE`).
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleDispatch('Email')}
                          disabled={working}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Dispatch via Email + PDF
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDispatch('WhatsApp')}
                          disabled={working}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          {copiedWhatsApp
                            ? 'Copied & Logged WhatsApp Dispatch'
                            : 'Copy WhatsApp Proposal & Mark Sent'}
                        </button>

                        {whatsappPreview && (
                          <a
                            href={whatsappPreview.waUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            Open wa.me Link
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {whatsappPreview && (
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-600">
                              Formatted Client Proposal Message Preview
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator.clipboard) {
                                  void navigator.clipboard.writeText(whatsappPreview.message);
                                  setCopiedWhatsApp(true);
                                  setTimeout(() => setCopiedWhatsApp(false), 2500);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy Text
                            </button>
                          </div>
                          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
                            {whatsappPreview.message}
                          </pre>
                        </div>
                      )}
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
