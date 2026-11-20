import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react';
import {
  DEPARTMENTS,
  DEPARTMENT_FULL_NAMES,
  ENTITY_TYPES,
  type Department,
  type EntityType,
  type UserSession,
} from '../types';

export interface NewLeadInput {
  companyName: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  entityType: EntityType;
  inquiryNotes: string;
  targetDept: Department;
  secondaryDepts: Department[];
  assignedPicName: string;
  receivedAt: string;
}

interface InboundTriageModalProps {
  open: boolean;
  onClose: () => void;
  session: UserSession;
  onCreateLead: (input: NewLeadInput) => void;
}

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function InboundTriageModal({
  open,
  onClose,
  session,
  onCreateLead,
}: InboundTriageModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('Sdn Bhd');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [targetDept, setTargetDept] = useState<Department>(session.department);
  const [secondaryDepts, setSecondaryDepts] = useState<Department[]>([]);
  const [assignedPicName, setAssignedPicName] = useState(session.name);
  const [receivedAtLocal, setReceivedAtLocal] = useState(() => toLocalDateTimeInput(new Date()));

  // Optional raw email AI parser (no sample data)
  const [showAiExtract, setShowAiExtract] = useState(false);
  const [rawEmailText, setRawEmailText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggleSecondary = (dept: Department) => {
    if (dept === targetDept) return;
    setSecondaryDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const handleAiExtract = async () => {
    setError(null);
    if (rawEmailText.trim().length < 10) {
      setError('Paste a real client inquiry email (at least 10 characters) to auto-fill fields.');
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailSubject: '', rawEmailBody: rawEmailText }),
      });
      const data = (await res.json()) as {
        triage?: {
          company_name?: string;
          contact_person?: string;
          contact_email?: string;
          contact_phone?: string;
          primary_department?: string;
          service_lines?: string[];
          inquiry_summary?: string;
          inferred_entity_type?: string;
        };
        error?: string;
      };
      if (!res.ok || !data.triage) {
        throw new Error(data.error || 'Unable to parse email right now.');
      }

      const mapDept = (raw?: string): Department => {
        if (!raw) return session.department;
        const lower = raw.toLowerCase();
        if (lower.includes('cosec') || lower.includes('co sec')) return 'Co Sec';
        if (lower.includes('acc')) return 'Accounting';
        if (lower.includes('aud')) return 'Audit';
        if (lower.includes('tax')) return 'Tax';
        if (lower.includes('pay')) return 'Payroll';
        if (lower.includes('fin') || lower.includes('fp&a') || lower.includes('advis')) return 'Finance';
        return session.department;
      };

      const t = data.triage;
      if (t.company_name) setCompanyName(t.company_name);
      if (t.contact_person) setContactPerson(t.contact_person);
      if (t.contact_email) setContactEmail(t.contact_email);
      if (t.contact_phone) setContactPhone(t.contact_phone);
      if (t.inquiry_summary) setInquiryNotes(t.inquiry_summary);

      const primary = mapDept(t.primary_department);
      setTargetDept(primary);
      if (Array.isArray(t.service_lines)) {
        const mapped = t.service_lines.map(mapDept).filter((d) => d !== primary);
        setSecondaryDepts(Array.from(new Set(mapped)));
      }
      if (t.inferred_entity_type && ENTITY_TYPES.includes(t.inferred_entity_type as EntityType)) {
        setEntityType(t.inferred_entity_type as EntityType);
      }
      setShowAiExtract(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email parsing failed.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!companyName.trim() || !contactPerson.trim()) {
      setError('Company Name and Contact Person are required.');
      return;
    }
    if (!assignedPicName.trim()) {
      setError('Assign a Department PIC responsible for 4-working-day outreach.');
      return;
    }

    const parsedDate = receivedAtLocal ? new Date(receivedAtLocal) : new Date();
    const receivedIso = Number.isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();

    onCreateLead({
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      entityType,
      inquiryNotes: inquiryNotes.trim(),
      targetDept,
      secondaryDepts: secondaryDepts.filter((d) => d !== targetDept),
      assignedPicName: assignedPicName.trim(),
      receivedAt: receivedIso,
    });

    // Clear form
    setCompanyName('');
    setContactPerson('');
    setContactPhone('');
    setContactEmail('');
    setEntityType('Sdn Bhd');
    setInquiryNotes('');
    setSecondaryDepts([]);
    setRawEmailText('');
    setReceivedAtLocal(toLocalDateTimeInput(new Date()));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-modal-heading"
    >
      <div className="bg-white border border-[#E3E3E3] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E3E3E3] flex items-center justify-between gap-4">
          <div>
            <h2 id="triage-modal-heading" className="text-base font-semibold text-[#171717]">
              Step 1: Inbound Lead Triage &amp; Routing
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Log incoming client inquiry, route to target department, and assign a PIC with a 4-working-day SLA clock.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-[#171717] rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
              {error}
            </div>
          )}

          {/* Optional raw email paste expander */}
          <div className="border border-[#E3E3E3] rounded-lg bg-[#FAFAFA]">
            <button
              type="button"
              onClick={() => setShowAiExtract((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-neutral-700 hover:text-[#171717] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#EE6F57]" />
                Optional: Auto-fill from pasted raw client email
              </span>
              {showAiExtract ? (
                <ChevronUp className="w-4 h-4 text-neutral-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-neutral-400" />
              )}
            </button>
            {showAiExtract && (
              <div className="px-4 pb-4 space-y-2.5 border-t border-[#E3E3E3] pt-3">
                <textarea
                  rows={4}
                  value={rawEmailText}
                  onChange={(e) => setRawEmailText(e.target.value)}
                  placeholder="Paste the client's incoming email message here to extract contact details and recommended department..."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAiExtract}
                    disabled={extracting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EE6F57] hover:bg-[#DC5E46] rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {extracting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Extract Fields
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Client Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Company Name <span className="text-[#CB3737]">*</span>
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Prospect Sdn Bhd"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Entity Type
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              >
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Contact Person <span className="text-[#CB3737]">*</span>
              </label>
              <input
                type="text"
                required
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Director or representative name"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Phone / WhatsApp
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+60 1X-XXX XXXX"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="contact@company.com.my"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
            </div>
          </div>

          {/* Routing & PIC Assignment (Steps 1 & 2) */}
          <div className="pt-4 border-t border-[#E3E3E3] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Target Department <span className="text-[#CB3737]">*</span>
                </label>
                <select
                  value={targetDept}
                  onChange={(e) => {
                    const next = e.target.value as Department;
                    setTargetDept(next);
                    setSecondaryDepts((prev) => prev.filter((d) => d !== next));
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept} — {DEPARTMENT_FULL_NAMES[dept]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Assigned Department PIC <span className="text-[#CB3737]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={assignedPicName}
                  onChange={(e) => setAssignedPicName(e.target.value)}
                  placeholder="PIC staff name"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Additional Service Lines (Optional)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.filter((d) => d !== targetDept).map((dept) => {
                    const selected = secondaryDepts.includes(dept);
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => toggleSecondary(dept)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#EE6F57] text-white border-[#EE6F57]'
                            : 'bg-white text-neutral-600 border-[#E3E3E3] hover:border-neutral-400'
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
                  Received / Assignment Timestamp (`received_at`)
                </label>
                <input
                  type="datetime-local"
                  value={receivedAtLocal}
                  onChange={(e) => setReceivedAtLocal(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Inquiry Notes &amp; Requirements
              </label>
              <textarea
                rows={3}
                value={inquiryNotes}
                onChange={(e) => setInquiryNotes(e.target.value)}
                placeholder="Summarize the client's inquiry, compliance timelines, or requested services..."
                className="w-full px-3 py-2 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#E3E3E3] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-700 bg-white border border-[#E3E3E3] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
            >
              Route Lead &amp; Start 4-Day SLA Clock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
