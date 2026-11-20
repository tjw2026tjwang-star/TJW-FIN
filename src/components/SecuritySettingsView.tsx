import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import {
  isAdministratorSession,
  type Lead,
  type Quotation,
  type StaffSecurityProfile,
  type UserSession,
} from '../types';
import { formatDateTime, formatMyr } from '../lib/sla';

interface SecuritySettingsViewProps {
  session: UserSession;
  staffProfiles: StaffSecurityProfile[];
  leads: Lead[];
  quotations: Quotation[];
  onRequestOwn2faReset: (reason: string) => void;
  onAdminApprove2faOverride: (
    targetEmail: string,
    mode: 'RESET_REENROLL' | 'COMPLETE_ENROLLMENT',
    verificationNote: string
  ) => void;
  onAdminVoidQuotation: (quotationId: string, reason: string) => void;
  onAdminArchiveLead: (leadId: string, reason: string) => void;
}

type ConfirmModalState =
  | null
  | {
      type: '2FA_OVERRIDE';
      profile: StaffSecurityProfile;
      overrideMode: 'RESET_REENROLL' | 'COMPLETE_ENROLLMENT';
    }
  | {
      type: 'VOID_QUOTATION';
      quotation: Quotation;
    }
  | {
      type: 'ARCHIVE_LEAD';
      lead: Lead;
    };

export function SecuritySettingsView({
  session,
  staffProfiles,
  leads,
  quotations,
  onRequestOwn2faReset,
  onAdminApprove2faOverride,
  onAdminVoidQuotation,
  onAdminArchiveLead,
}: SecuritySettingsViewProps) {
  const isAdministrator = isAdministratorSession(session);

  // Non-admin 2FA reset request form (cannot alter 2FA status themselves)
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestReason, setRequestReason] = useState('');

  // Administrator Danger Zone explicit re-authentication state
  const [dangerZoneUnlocked, setDangerZoneUnlocked] = useState(false);
  const [reauthEmail, setReauthEmail] = useState('');
  const [reauthName, setReauthName] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);

  // Explicit Approval Modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [modalNote, setModalNote] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentProfile = useMemo(
    () => staffProfiles.find((p) => p.email.toLowerCase() === session.email.toLowerCase()) || null,
    [staffProfiles, session.email]
  );

  const voidableQuotations = useMemo(
    () => quotations.filter((q) => q.status !== 'Dispatched' && q.status !== 'Voided'),
    [quotations]
  );

  const activeLeads = useMemo(() => leads.filter((l) => !l.archived), [leads]);
  const archivedLeads = useMemo(() => leads.filter((l) => Boolean(l.archived)), [leads]);

  const handleUnlockDangerZone = (e: React.FormEvent) => {
    e.preventDefault();
    setReauthError(null);
    if (!isAdministrator) return;

    const emailMatch =
      reauthEmail.trim().toLowerCase() === session.email.trim().toLowerCase();
    const nameMatch =
      reauthName.trim().toLowerCase() === session.name.trim().toLowerCase();

    if (!emailMatch || !nameMatch) {
      setReauthError(
        'Admin verification failed. Re-enter your exact signed-in Administrator Full Name and Work Email to unlock the Danger Zone.'
      );
      return;
    }

    setDangerZoneUnlocked(true);
    setReauthEmail('');
    setReauthName('');
    setFeedback(
      'System Administrator credentials verified. Danger Zone controls are unlocked for this session.'
    );
  };

  const handleSubmit2faRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = requestReason.trim();
    if (trimmed.length < 6) return;
    onRequestOwn2faReset(trimmed);
    setRequestReason('');
    setRequestFormOpen(false);
    setFeedback(
      '2FA reset request submitted to the Finance System Administrator. Your 2FA state remains locked until explicitly approved in the Danger Zone.'
    );
  };

  const handleConfirmModalAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmModal || !isAdministrator || !dangerZoneUnlocked) return;
    setModalError(null);
    const trimmedNote = modalNote.trim();
    if (trimmedNote.length < 5) {
      setModalError('Enter an identity verification or governance reason (minimum 5 characters).');
      return;
    }

    if (confirmModal.type === '2FA_OVERRIDE') {
      onAdminApprove2faOverride(
        confirmModal.profile.email,
        confirmModal.overrideMode,
        trimmedNote
      );
      setFeedback(
        `System Administrator approved and executed 2FA ${
          confirmModal.overrideMode === 'RESET_REENROLL' ? 'reset / re-enrollment' : 're-enrollment completion'
        } for ${confirmModal.profile.email}. Logged as DANGER_ZONE_2FA_OVERRIDE.`
      );
    } else if (confirmModal.type === 'VOID_QUOTATION') {
      onAdminVoidQuotation(confirmModal.quotation.id, trimmedNote);
      setFeedback(
        `Quotation ${confirmModal.quotation.quoteNumber} voided and locked. Immutable audit trail preserved (DANGER_ZONE_VOID_QUOTATION).`
      );
    } else if (confirmModal.type === 'ARCHIVE_LEAD') {
      onAdminArchiveLead(confirmModal.lead.id, trimmedNote);
      setFeedback(
        `Lead ${confirmModal.lead.leadCode} (${confirmModal.lead.companyName}) archived from active pipeline. Immutable audit trail preserved (DANGER_ZONE_ARCHIVE_LEAD).`
      );
    }

    setConfirmModal(null);
    setModalNote('');
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-3.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Section 1: Staff Account & 2FA Authentication Governance Policy (Visible to All Roles) */}
      <section className="bg-white border border-[#E3E3E3] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E3E3E3] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[#CB3737]" />
            <div>
              <h2 className="text-sm font-semibold text-[#171717]">
                Two-Factor Authentication (2FA) &amp; Session Governance
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Strict anti-tampering policy · 10-minute continuous inactivity auto-logout active
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-neutral-600">
            {session.role} · {session.department}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-1">
              <p className="text-neutral-500">Signed-in Staff Account</p>
              <p className="text-sm font-semibold text-[#171717]">{session.name}</p>
              <p className="font-mono text-neutral-600">{session.email}</p>
            </div>

            <div className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-1">
              <p className="text-neutral-500">2FA Protection Status</p>
              <p
                className={`text-sm font-semibold ${
                  currentProfile?.twoFactorStatus === 'Re-Enrollment Required'
                    ? 'text-[#EE6F57]'
                    : 'text-emerald-700'
                }`}
              >
                {currentProfile?.twoFactorStatus || 'Enrolled'}
              </p>
              <p className="text-neutral-600">
                {currentProfile?.twoFactorMethod || 'Authenticator App (TOTP)'} ·{' '}
                {currentProfile?.recoveryCodesRemaining ?? 8} recovery keys
              </p>
            </div>

            <div className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-1">
              <p className="text-neutral-500">Idle Security Watchdog</p>
              <p className="text-sm font-semibold text-[#171717]">10 Minutes (600,000 ms)</p>
              <p className="text-neutral-600">
                Purges `tjw_session` &amp; logs `SESSION_TIMEOUT_IDLE`
              </p>
            </div>
          </div>

          {/* Strict Anti-Tampering Policy Notice */}
          <div className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-2.5 text-xs max-w-2xl">
              <Lock className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[#171717]">
                  Strict 2FA Anti-Tampering Policy Enforced
                </p>
                <p className="text-neutral-600 leading-relaxed">
                  Staff 2FA status, recovery keys, hardware tokens, and authenticator bindings
                  cannot be changed, reset, bypassed, or disabled unless explicitly approved and
                  executed by a Finance Department System Administrator inside the Danger Zone.
                </p>
                {currentProfile?.resetRequestPending && (
                  <p className="text-[#EE6F57] font-medium pt-1">
                    Pending 2FA reset request submitted on{' '}
                    {formatDateTime(currentProfile.resetRequestedAt)} — Reason:{' '}
                    &ldquo;{currentProfile.resetRequestReason}&rdquo; (Awaiting System Administrator
                    approval).
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled
                title="2FA cannot be disabled or reset without System Administrator approval"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 bg-white border border-[#E3E3E3] rounded-md cursor-not-allowed"
              >
                <Lock className="w-3 h-3" />
                Disable / Reset 2FA (Admin Only)
              </button>

              {!isAdministrator && !currentProfile?.resetRequestPending && (
                <button
                  type="button"
                  onClick={() => setRequestFormOpen((v) => !v)}
                  className="px-3 py-1.5 text-xs font-semibold text-[#CB3737] bg-white border border-[#CB3737]/40 hover:bg-[#CB3737] hover:text-white rounded-md transition-colors cursor-pointer"
                >
                  {requestFormOpen ? 'Cancel Request' : 'Request Admin 2FA Reset'}
                </button>
              )}
            </div>
          </div>

          {!isAdministrator && requestFormOpen && (
            <form
              onSubmit={handleSubmit2faRequest}
              className="p-4 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-3"
            >
              <label className="block text-xs font-medium text-neutral-700">
                Lost 2FA Device / Re-Enrollment Justification (Sent to System Administrator)
              </label>
              <textarea
                rows={2}
                required
                minLength={6}
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Describe reason for 2FA reset (e.g., replaced corporate phone, lost hardware token)..."
                className="w-full px-3 py-2 text-xs bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRequestFormOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 bg-white border border-[#E3E3E3] rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-md cursor-pointer"
                >
                  Submit Request for Admin Approval
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Section 2: DANGER ZONE — STRICTLY HIDDEN & INACCESSIBLE TO USER AND EXECUTIVE ROLES */}
      {isAdministrator && (
        <section className="bg-white border-2 border-[#CB3737]/40 rounded-xl overflow-hidden">
          <div className="px-6 py-4 bg-[#CB3737]/5 border-b border-[#CB3737]/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-[#CB3737] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-[#CB3737]">
                  Danger Zone — System Administrator Security Governance
                </h2>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Exclusive to Finance Department Administrators. Operates strictly on real live
                  records. The immutable append-only Audit Trail can never be deleted or truncated.
                </p>
              </div>
            </div>

            {dangerZoneUnlocked ? (
              <button
                type="button"
                onClick={() => setDangerZoneUnlocked(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#171717] bg-white border border-[#E3E3E3] hover:border-[#CB3737] hover:text-[#CB3737] rounded-md transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Re-Lock Danger Zone
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CB3737]">
                <Lock className="w-3.5 h-3.5" />
                Locked · Re-Authentication Required
              </span>
            )}
          </div>

          {!dangerZoneUnlocked ? (
            <form onSubmit={handleUnlockDangerZone} className="p-6 space-y-4 max-w-xl">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#171717]">
                  Step-Up Administrator Credential Verification
                </p>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Re-enter your exact signed-in Administrator Full Name and Work Email to unlock
                  2FA overrides, quotation voiding, and lead archiving controls.
                </p>
              </div>

              {reauthError && (
                <div className="p-3 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
                  {reauthError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Administrator Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={reauthName}
                    onChange={(e) => setReauthName(e.target.value)}
                    placeholder={session.name}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Administrator Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={reauthEmail}
                    onChange={(e) => setReauthEmail(e.target.value)}
                    placeholder={session.email}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                Verify Credentials &amp; Unlock Danger Zone
              </button>
            </form>
          ) : (
            <div className="p-6 space-y-8">
              {/* Audit Trail Immutability Guarantee Banner */}
              <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg flex items-start gap-2.5 text-xs text-neutral-700">
                <ShieldCheck className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
                <span>
                  <strong>Audit Trail Permanently Protected:</strong> Every action executed below
                  writes an immutable UTC+8 audit record (`DANGER_ZONE_2FA_OVERRIDE`,
                  `DANGER_ZONE_VOID_QUOTATION`, `DANGER_ZONE_ARCHIVE_LEAD`). No Danger Zone tool can
                  ever delete, alter, or truncate the audit log.
                </span>
              </div>

              {/* 2A. 2FA Authentication Management (Real Live Staff Registry Only) */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#171717]">
                    1. Staff Two-Factor Authentication (2FA) Overrides ({staffProfiles.length})
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Real signed-in staff profiles only. Approving a 2FA reset immediately records
                    `DANGER_ZONE_2FA_OVERRIDE`.
                  </p>
                </div>

                {staffProfiles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                    No staff profiles registered yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#E3E3E3] rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAFAFA] border-b border-[#E3E3E3] text-neutral-500 font-medium">
                          <th className="py-2.5 px-4">Staff Member</th>
                          <th className="py-2.5 px-4">Dept &amp; Role</th>
                          <th className="py-2.5 px-4">2FA Status</th>
                          <th className="py-2.5 px-4">Last Override / Request</th>
                          <th className="py-2.5 px-4 text-right">Admin Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E3E3]">
                        {staffProfiles.map((profile) => (
                          <tr key={profile.email} className="align-top">
                            <td className="py-3 px-4">
                              <p className="font-semibold text-[#171717]">{profile.name}</p>
                              <p className="font-mono text-[11px] text-neutral-500">
                                {profile.email}
                              </p>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-medium text-neutral-800">{profile.role}</span>
                              <span className="text-neutral-400"> · {profile.department}</span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={
                                  profile.twoFactorStatus === 'Re-Enrollment Required'
                                    ? 'font-semibold text-[#EE6F57]'
                                    : 'font-semibold text-emerald-700'
                                }
                              >
                                {profile.twoFactorStatus}
                              </span>
                              {profile.resetRequestPending && (
                                <p className="text-[11px] text-[#CB3737] font-semibold mt-0.5">
                                  Reset Requested
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-neutral-600 max-w-xs">
                              {profile.resetRequestPending ? (
                                <p className="text-[#CB3737]">
                                  Request: &ldquo;{profile.resetRequestReason}&rdquo;
                                </p>
                              ) : profile.lastResetAt ? (
                                <p>
                                  Reset by <strong>{profile.lastResetBy}</strong> on{' '}
                                  <span className="font-mono tabular-nums">
                                    {formatDateTime(profile.lastResetAt)}
                                  </span>
                                </p>
                              ) : (
                                <span className="text-neutral-400">No overrides logged</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalNote('');
                                    setModalError(null);
                                    setConfirmModal({
                                      type: '2FA_OVERRIDE',
                                      profile,
                                      overrideMode: 'RESET_REENROLL',
                                    });
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-md transition-colors cursor-pointer"
                                >
                                  Reset / Re-Enroll 2FA
                                </button>
                                {profile.twoFactorStatus === 'Re-Enrollment Required' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalNote('');
                                      setModalError(null);
                                      setConfirmModal({
                                        type: '2FA_OVERRIDE',
                                        profile,
                                        overrideMode: 'COMPLETE_ENROLLMENT',
                                      });
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-[#171717] bg-white border border-[#E3E3E3] hover:border-emerald-600 hover:text-emerald-700 rounded-md transition-colors cursor-pointer"
                                  >
                                    Confirm Enrolled
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <hr className="border-[#E3E3E3]" />

              {/* 2B. Void Stalled Quotations (Real Live Quotations Only) */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#171717]">
                    2. Void Stalled Quotations ({voidableQuotations.length} eligible)
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Permanently voids un-dispatched quotations (`status = Voided`) while retaining
                    full historical and audit traceability.
                  </p>
                </div>

                {voidableQuotations.length === 0 ? (
                  <div className="p-5 text-center text-xs text-neutral-500 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                    No active non-dispatched quotations available to void.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E3E3E3] border border-[#E3E3E3] rounded-lg">
                    {voidableQuotations.map((q) => (
                      <div
                        key={q.id}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-[#171717]">
                            <span className="font-mono">{q.quoteNumber}</span> · {q.companyName}
                          </p>
                          <p className="text-neutral-500 mt-0.5">
                            {q.targetDept} · {q.status} · Year-1{' '}
                            <span className="font-mono tabular-nums">
                              {formatMyr(q.totalYearOneMyr)}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setModalNote('');
                            setModalError(null);
                            setConfirmModal({ type: 'VOID_QUOTATION', quotation: q });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/30 hover:bg-[#CB3737] hover:text-white rounded-md transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Void Quotation
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-[#E3E3E3]" />

              {/* 2C. Archive Active Leads (Real Live Leads Only) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[#171717]">
                      3. Archive Inactive / Closed Leads ({activeLeads.length} active ·{' '}
                      {archivedLeads.length} archived)
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Removes a real lead from the active pipeline without erasing records or audit
                      history.
                    </p>
                  </div>
                </div>

                {activeLeads.length === 0 ? (
                  <div className="p-5 text-center text-xs text-neutral-500 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg">
                    No active leads available to archive.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E3E3E3] border border-[#E3E3E3] rounded-lg">
                    {activeLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-[#171717]">
                            <span className="font-mono">{lead.leadCode}</span> · {lead.companyName}
                          </p>
                          <p className="text-neutral-500 mt-0.5">
                            {lead.targetDept} · PIC: {lead.assignedPicName} · {lead.contactStatus}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setModalNote('');
                            setModalError(null);
                            setConfirmModal({ type: 'ARCHIVE_LEAD', lead });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/30 hover:bg-[#CB3737] hover:text-white rounded-md transition-colors cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          Archive Lead
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Explicit System Administrator Approval Modal */}
      {confirmModal && isAdministrator && dangerZoneUnlocked && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmModalAction}
            className="bg-white border border-[#E3E3E3] rounded-xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#CB3737]/5 border-b border-[#CB3737]/25 flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
                <h3 className="text-sm font-bold text-[#171717]">
                  {confirmModal.type === '2FA_OVERRIDE'
                    ? `Approve 2FA Reset / Re-Enrollment for ${confirmModal.profile.name} (${confirmModal.profile.email})`
                    : confirmModal.type === 'VOID_QUOTATION'
                      ? `Confirm Void Quotation ${confirmModal.quotation.quoteNumber}`
                      : `Confirm Archive Lead ${confirmModal.lead.leadCode}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="p-1 text-neutral-400 hover:text-[#171717] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {confirmModal.type === '2FA_OVERRIDE' && (
                <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg space-y-1 text-neutral-700">
                  <p>
                    Staff Identity: <strong>{confirmModal.profile.name}</strong> (
                    <span className="font-mono">{confirmModal.profile.email}</span>)
                  </p>
                  <p>
                    Department &amp; Role: <strong>{confirmModal.profile.department}</strong> ·{' '}
                    <strong>{confirmModal.profile.role}</strong>
                  </p>
                  <p>
                    Action:{' '}
                    <strong>
                      {confirmModal.overrideMode === 'RESET_REENROLL'
                        ? 'Reset existing 2FA token & require immediate re-enrollment'
                        : 'Verify completed 2FA re-enrollment & restore Enrolled status'}
                    </strong>
                  </p>
                </div>
              )}

              {confirmModal.type === 'VOID_QUOTATION' && (
                <p className="text-neutral-600 leading-relaxed">
                  Voiding <strong>{confirmModal.quotation.quoteNumber}</strong> for{' '}
                  <strong>{confirmModal.quotation.companyName}</strong> will permanently disable
                  editing, approval, and client dispatch. Audit records remain untouched.
                </p>
              )}

              {confirmModal.type === 'ARCHIVE_LEAD' && (
                <p className="text-neutral-600 leading-relaxed">
                  Archiving <strong>{confirmModal.lead.leadCode}</strong> (
                  <strong>{confirmModal.lead.companyName}</strong>) will remove it from the active
                  Leads Pipeline while preserving all immutable audit records.
                </p>
              )}

              {modalError && (
                <div className="p-3 text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block font-medium text-neutral-700 mb-1.5">
                  {confirmModal.type === '2FA_OVERRIDE'
                    ? 'Staff Identity Verification & Approval Note (Recorded in Audit Trail)'
                    : 'Administrative Governance Reason (Recorded in Audit Trail)'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder={
                    confirmModal.type === '2FA_OVERRIDE'
                      ? 'Confirm out-of-band identity verification (e.g., verified in person / corporate directory callback)...'
                      : 'Enter mandatory governance justification...'
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-3.5 py-2 font-medium text-neutral-600 bg-white border border-[#E3E3E3] rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
                >
                  {confirmModal.type === '2FA_OVERRIDE'
                    ? 'Approve & Execute 2FA Override'
                    : confirmModal.type === 'VOID_QUOTATION'
                      ? 'Confirm Void Quotation'
                      : 'Confirm Archive Lead'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
