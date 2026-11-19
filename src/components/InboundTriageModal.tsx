import { useState } from 'react';
import { Loader2, Mail, Sparkles, X } from 'lucide-react';
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  type AiTriageResult,
  type Department,
  type EntityType,
  type Lead,
  type OrgConfig,
  type UserProfile,
} from '../types';
import { SAMPLE_INBOUND_EMAILS } from '../lib/sampleData';
import { createLeadFromTriage } from '../lib/firestoreService';

interface InboundTriageModalProps {
  open: boolean;
  onClose: () => void;
  actor: UserProfile;
  orgConfig: OrgConfig;
  onLeadCreated: (lead: Lead) => void;
}

export function InboundTriageModal({
  open,
  onClose,
  actor,
  orgConfig,
  onLeadCreated,
}: InboundTriageModalProps) {
  const [emailSubject, setEmailSubject] = useState('');
  const [rawEmailBody, setRawEmailBody] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable extracted triage output
  const [triage, setTriage] = useState<AiTriageResult | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [inquirySummary, setInquirySummary] = useState('');
  const [serviceLines, setServiceLines] = useState<Department[]>([]);
  const [assignedDept, setAssignedDept] = useState<Department>('CoSec');
  const [entityType, setEntityType] = useState<EntityType>('');

  if (!open) return null;

  const loadSample = (sampleId: string) => {
    const sample = SAMPLE_INBOUND_EMAILS.find((s) => s.id === sampleId);
    if (!sample) return;
    setEmailSubject(sample.subject);
    setRawEmailBody(sample.body);
    setTriage(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    setError(null);
    if (rawEmailBody.trim().length < 15) {
      setError('Paste a client inquiry email (at least 15 characters) before running AI triage.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailSubject, rawEmailBody }),
      });
      const data = (await res.json()) as { triage?: AiTriageResult; error?: string };
      if (!res.ok || !data.triage) {
        throw new Error(data.error || 'AI Triage request failed.');
      }

      const result = data.triage;
      setTriage(result);
      setCompanyName(result.company_name || '');
      setContactPerson(result.contact_person || '');
      setContactEmail(result.contact_email || '');
      setContactPhone(result.contact_phone || '');
      setInquirySummary(result.inquiry_summary || '');
      setServiceLines(result.service_lines?.length ? result.service_lines : [result.primary_department]);
      setAssignedDept(result.primary_department || 'CoSec');
      setEntityType(result.inferred_entity_type || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse email.');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleServiceLine = (dept: Department) => {
    setServiceLines((prev) => {
      if (prev.includes(dept)) {
        return prev.length > 1 ? prev.filter((d) => d !== dept) : prev;
      }
      return [...prev, dept];
    });
  };

  const handleConfirmRoute = async () => {
    if (!companyName.trim() || !contactPerson.trim()) {
      setError('Company name and contact person are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createLeadFromTriage(
        {
          emailSubject: emailSubject || `Inquiry from ${companyName}`,
          rawEmailBody,
          companyName,
          contactPerson,
          contactEmail,
          contactPhone,
          inquirySummary,
          serviceLines: serviceLines.length ? serviceLines : [assignedDept],
          assignedDept,
          entityType,
        },
        actor,
        orgConfig
      );
      onLeadCreated(created);
      // Reset state
      setEmailSubject('');
      setRawEmailBody('');
      setTriage(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead.');
    } finally {
      setSaving(false);
    }
  };

  const routedPic = orgConfig.departmentPics[assignedDept];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 id="triage-modal-title" className="text-base font-semibold text-slate-900">
              Step 1: Inbound Email Ingestion &amp; AI Routing
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Parse raw prospect emails into structured lead records and route to the designated Department PIC.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick sample loaders */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Load sample Malaysian SME inquiry</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_INBOUND_EMAILS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => loadSample(sample.id)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="email-subject" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email Subject
              </label>
              <input
                id="email-subject"
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="e.g. Inquiry for Sdn Bhd Incorporation & Monthly Bookkeeping"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400"
              />
            </div>

            <div>
              <label htmlFor="email-body" className="block text-xs font-medium text-slate-700 mb-1.5">
                Raw Inbound Email Body
              </label>
              <textarea
                id="email-body"
                rows={6}
                value={rawEmailBody}
                onChange={(e) => setRawEmailBody(e.target.value)}
                placeholder="Paste the prospect's email message including signature and requested services..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400 resize-y"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500">
                Extracts entity profile, contact info, service lines, and primary PIC routing.
              </span>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Analyzing Email...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Extract &amp; Route with AI
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {triage && (
            <div className="pt-5 border-t border-slate-200 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Extracted Lead Profile &amp; PIC Assignment
                </h3>
                <span className="text-xs text-emerald-700 font-medium">
                  Auto-routed to {DEPARTMENT_LABELS[assignedDept]}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone / WhatsApp</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Primary Owning Department
                  </label>
                  <select
                    value={assignedDept}
                    onChange={(e) => setAssignedDept(e.target.value as Department)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {DEPARTMENT_LABELS[dept]} ({orgConfig.departmentPics[dept]?.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Identified Service Lines
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DEPARTMENTS.map((dept) => {
                      const active = serviceLines.includes(dept);
                      return (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => toggleServiceLine(dept)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {dept}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Executive Inquiry Summary
                </label>
                <textarea
                  rows={3}
                  value={inquirySummary}
                  onChange={(e) => setInquirySummary(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                />
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    PIC notification will be assigned to <strong>{routedPic?.name || actor.displayName}</strong> with a{' '}
                    <strong className="font-mono tabular-nums">{orgConfig.slaWorkingDays}-working-day</strong> outreach SLA clock.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmRoute}
            disabled={!triage || saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create Lead &amp; Notify PIC
          </button>
        </div>
      </div>
    </div>
  );
}
