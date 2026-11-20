import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  FilePlus2,
  Loader2,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import type { AssistantResponse, UserSession } from '../types';
import { DEPARTMENT_FULL_NAMES } from '../types';
import { formatMyr } from '../lib/sla';

interface AssistantWorkbenchProps {
  session: UserSession;
  onImportLead: (result: AssistantResponse, rawInput: string) => void;
  onImportLeadAndQuotation: (result: AssistantResponse, rawInput: string) => void;
}

export function AssistantWorkbench({
  session,
  onImportLead,
  onImportLeadAndQuotation,
}: AssistantWorkbenchProps) {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'reply' | 'json' | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = inputText.trim();
    if (trimmed.length < 10) {
      setError('Paste a real client inquiry email or confirmed PIC scope notes (at least 10 characters).');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      });
      const data = (await res.json()) as { result?: AssistantResponse; error?: string };
      if (!res.ok || !data.result) {
        throw new Error(data.error || 'Assistant failed to analyze input.');
      }
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach assistant endpoint.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, key: 'reply' | 'json') => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const hasQuoteItems = Boolean(result && result.quotation.line_items.length > 0);
  const estYearOne = result
    ? result.quotation.total_setup_fee_myr +
      result.quotation.total_monthly_recurring_myr * 12 +
      result.quotation.total_annual_recurring_myr
    : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Input Form (Strictly empty initial state) */}
      <form
        onSubmit={handleAnalyze}
        className="xl:col-span-5 bg-white border border-[#E3E3E3] rounded-xl p-6 space-y-5"
      >
        <div className="space-y-1 border-b border-[#E3E3E3] pb-4">
          <h2 className="text-base font-semibold text-[#171717] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#EE6F57]" />
            Triage, SLA Routing &amp; Quotation Assistant
          </h2>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Auto-detects inbound client inquiries (Task 1: Lead Triage) or confirmed PIC discovery
            notes (Task 2: MYR Quotation Generation) across all 6 corporate service lines.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] text-neutral-600">
          {(['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'] as const).map((dept) => (
            <div
              key={dept}
              className="px-2.5 py-1.5 bg-[#FAFAFA] border border-[#E3E3E3] rounded-md font-medium truncate"
              title={DEPARTMENT_FULL_NAMES[dept]}
            >
              {dept}
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="assistant-input"
            className="block text-xs font-medium text-neutral-700 mb-1.5"
          >
            Client Inquiry Email or Confirmed PIC Scope Notes
          </label>
          <textarea
            id="assistant-input"
            rows={10}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste an incoming client email/WhatsApp message for Step 1 Lead Triage, or paste confirmed PIC scope notes (turnover, monthly transactions, headcount, FP&A/advisory needs) for Step 6 MYR Quotation generation..."
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737] leading-relaxed"
          />
          <p className="text-[11px] text-neutral-500 mt-1.5">
            Active session: <strong className="text-neutral-700">{session.name}</strong> (
            {session.role}). Quotations imported enter Pending Approval and require Administrator
            sign-off before dispatch.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setInputText('');
              setResult(null);
              setError(null);
            }}
            className="px-3.5 py-2 text-xs font-medium text-neutral-600 bg-white border border-[#E3E3E3] rounded-lg hover:bg-[#FAFAFA] transition-colors cursor-pointer"
          >
            Clear
          </button>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                Run Intelligence Assistant
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Right: Structured Output & Strict JSON Panel */}
      <div className="xl:col-span-7 bg-white border border-[#E3E3E3] rounded-xl overflow-hidden">
        {!result ? (
          <div className="p-14 text-center space-y-2">
            <p className="text-sm font-semibold text-[#171717]">
              Ready for real client inquiry or PIC scope input
            </p>
            <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
              Submit an inbound email or confirmed discovery note on the left to extract prospect
              profile, 6-department routing with 4-working-day SLA target, itemized MYR quotation
              fees, formal reply draft, and strict JSON output.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E3E3E3]">
            {/* Result Header & Actions */}
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-[#FAFAFA]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-semibold text-[#CB3737]">{result.mode}</span>
                <span aria-hidden="true" className="text-neutral-300">
                  ·
                </span>
                <span className="font-semibold text-[#171717]">
                  Primary: {result.routing.primary_dept}
                </span>
                <span aria-hidden="true" className="text-neutral-300">
                  ·
                </span>
                <span className="text-neutral-600 font-mono tabular-nums">
                  SLA: {result.routing.sla_days_limit} working days
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRawJson((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-[#E3E3E3] rounded-md hover:bg-neutral-50 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showRawJson ? 'Structured View' : 'View JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => copyText(JSON.stringify(result, null, 2), 'json')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-[#E3E3E3] rounded-md hover:bg-neutral-50 cursor-pointer"
                >
                  {copiedKey === 'json' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'json' ? 'Copied JSON' : 'Copy JSON'}
                </button>
              </div>
            </div>

            {showRawJson ? (
              <div className="p-6">
                <pre className="p-4 bg-[#171717] text-neutral-100 text-xs font-mono rounded-lg overflow-x-auto leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Prospect & Routing Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-neutral-500">Prospect Profile</p>
                    <p className="text-sm font-semibold text-[#171717]">
                      {result.lead_profile.company_name || 'Prospective Client'}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {result.lead_profile.contact_person || '—'} ·{' '}
                      <span className="font-medium">{result.lead_profile.entity_type}</span>
                    </p>
                    <p className="text-xs text-neutral-500 font-mono tabular-nums">
                      {result.lead_profile.contact_email || 'No email provided'}
                      {result.lead_profile.contact_phone
                        ? ` · ${result.lead_profile.contact_phone}`
                        : ''}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-neutral-500">
                      Department Routing &amp; 4-Day SLA Notice
                    </p>
                    <p className="text-sm font-semibold text-[#171717]">
                      {result.routing.primary_dept} —{' '}
                      {DEPARTMENT_FULL_NAMES[result.routing.primary_dept] ||
                        result.routing.primary_dept}
                    </p>
                    {result.routing.secondary_depts.length > 0 && (
                      <p className="text-xs text-neutral-600">
                        Secondary: {result.routing.secondary_depts.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      {result.routing.routing_reason}
                    </p>
                  </div>
                </div>

                {/* Quotation Section */}
                {hasQuoteItems && (
                  <div className="space-y-3 pt-4 border-t border-[#E3E3E3]">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#171717]">
                        Proposed MYR Quotation Schedule
                      </span>
                      <span className="font-mono tabular-nums text-neutral-600">
                        Validity: {result.quotation.validity_days || 30} days · Valid until{' '}
                        <strong className="text-[#171717]">{result.quotation.valid_until}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                        <p className="text-[11px] text-neutral-500">Setup Fee (One-off)</p>
                        <p className="text-sm font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                          {formatMyr(result.quotation.total_setup_fee_myr)}
                        </p>
                      </div>
                      <div className="p-3 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                        <p className="text-[11px] text-neutral-500">Monthly Recurring</p>
                        <p className="text-sm font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                          {formatMyr(result.quotation.total_monthly_recurring_myr)}
                        </p>
                      </div>
                      <div className="p-3 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                        <p className="text-[11px] text-neutral-500">Annual Recurring</p>
                        <p className="text-sm font-semibold text-[#171717] font-mono tabular-nums mt-0.5">
                          {formatMyr(result.quotation.total_annual_recurring_myr)}
                        </p>
                      </div>
                      <div className="p-3 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                        <p className="text-[11px] text-neutral-500">Est. Year-1 Total</p>
                        <p className="text-sm font-bold text-[#CB3737] font-mono tabular-nums mt-0.5">
                          {formatMyr(estYearOne)}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-[#E3E3E3] rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#FAFAFA] border-b border-[#E3E3E3] text-neutral-500">
                            <th className="py-2 px-3">Dept</th>
                            <th className="py-2 px-3">Service &amp; Scope</th>
                            <th className="py-2 px-3">Cycle</th>
                            <th className="py-2 px-3 text-right">Rate (MYR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E3E3]">
                          {result.quotation.line_items.map((item, idx) => (
                            <tr key={`${item.dept}-${idx}`} className="align-top">
                              <td className="py-2.5 px-3 font-medium text-neutral-700 whitespace-nowrap">
                                {item.dept}
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="font-medium text-[#171717]">{item.service_title}</p>
                                <p className="text-neutral-500 mt-0.5">{item.scope_summary}</p>
                              </td>
                              <td className="py-2.5 px-3 text-neutral-600 whitespace-nowrap">
                                {item.billing_cycle}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                                {formatMyr(item.rate_myr)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Formal Client Reply Draft */}
                <div className="space-y-2 pt-4 border-t border-[#E3E3E3]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-neutral-700">
                      Formal Client Reply Draft (Subject to Management Review)
                    </p>
                    <button
                      type="button"
                      onClick={() => copyText(result.client_reply_draft, 'reply')}
                      className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-[#171717] cursor-pointer"
                    >
                      {copiedKey === 'reply' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'reply' ? 'Copied' : 'Copy Draft'}
                    </button>
                  </div>
                  <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                    {result.client_reply_draft}
                  </div>
                </div>

                {/* Push Into 8-Step Pipeline */}
                <div className="pt-4 border-t border-[#E3E3E3] flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onImportLead(result, inputText.trim())}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#171717] bg-white border border-[#E3E3E3] hover:border-[#CB3737] hover:text-[#CB3737] rounded-lg transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Route Lead to Pipeline (Step 1)
                  </button>

                  {hasQuoteItems && (
                    <button
                      type="button"
                      onClick={() => onImportLeadAndQuotation(result, inputText.trim())}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" />
                      Import Lead + Quotation (Pending Approval)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
