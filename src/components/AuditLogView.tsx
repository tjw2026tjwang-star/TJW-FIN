import { useMemo, useState } from 'react';
import { Download, FileJson, Lock, Search, ShieldCheck } from 'lucide-react';
import type { AuditAction, AuditEntry, UserSession } from '../types';
import { formatDateTime } from '../lib/sla';

interface AuditLogViewProps {
  entries: AuditEntry[];
  session: UserSession;
  onSyncServerLogs: () => Promise<void>;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  VIEW_PAGE: 'VIEW_PAGE',
  TRIAGE_INBOUND_LEAD: 'TRIAGE_INBOUND_LEAD',
  EDIT_LEAD_TRIAGE: 'EDIT_LEAD_TRIAGE',
  UPDATE_CONTACT_STATUS: 'UPDATE_CONTACT_STATUS',
  EDIT_CONTACT_STATUS: 'EDIT_CONTACT_STATUS',
  LOG_SERVICE_SCOPE: 'LOG_SERVICE_SCOPE',
  GENERATE_QUOTATION: 'GENERATE_QUOTATION',
  EDIT_QUOTATION_DRAFT: 'EDIT_QUOTATION_DRAFT',
  AMEND_QUOTATION_VALIDITY: 'AMEND_QUOTATION_VALIDITY',
  APPROVE_QUOTATION: 'APPROVE_QUOTATION',
  DISPATCH_QUOTATION: 'DISPATCH_QUOTATION',
  EXPORT_AUDIT_LOG: 'EXPORT_AUDIT_LOG',
  SESSION_TIMEOUT_IDLE: 'SESSION_TIMEOUT_IDLE',
};

export function AuditLogView({ entries, session, onSyncServerLogs }: AuditLogViewProps) {
  const [actionFilter, setActionFilter] = useState<'ALL' | AuditAction>('ALL');
  const [query, setQuery] = useState('');
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const isAdministrator = session.role === 'Administrator';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (actionFilter !== 'ALL' && entry.action_taken !== actionFilter) return false;
      if (!q) return true;
      return (
        entry.log_id.toLowerCase().includes(q) ||
        entry.user_name.toLowerCase().includes(q) ||
        entry.user_email.toLowerCase().includes(q) ||
        entry.page_visited.toLowerCase().includes(q) ||
        entry.target_id.toLowerCase().includes(q) ||
        entry.action_details.toLowerCase().includes(q)
      );
    });
  }, [entries, actionFilter, query]);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!isAdministrator) return;
    setExportError(null);
    setExportFeedback(null);
    setExportingFormat(format);

    try {
      const response = await fetch(`/api/audit-logs/export?format=${format}`, {
        method: 'GET',
        headers: {
          'x-user-role': 'administrator',
          'x-user-name': session.name,
          'x-user-email': session.email,
          'x-user-department': session.department,
        },
      });

      if (!response.ok) {
        const errPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errPayload.error || 'Audit log export rejected by server.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || `tjw_audit_trail.${format}`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await onSyncServerLogs();
      setExportFeedback(
        `Exported immutable audit trail (${filename}) and logged EXPORT_AUDIT_LOG event.`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export audit trail.');
    } finally {
      setExportingFormat(null);
    }
  };

  const actionTone = (action: AuditAction) => {
    if (action === 'APPROVE_QUOTATION' || action === 'DISPATCH_QUOTATION') {
      return 'text-emerald-700';
    }
    if (
      action === 'AMEND_QUOTATION_VALIDITY' ||
      action === 'EXPORT_AUDIT_LOG' ||
      action === 'SESSION_TIMEOUT_IDLE'
    ) {
      return 'text-[#CB3737]';
    }
    if (
      action === 'TRIAGE_INBOUND_LEAD' ||
      action === 'EDIT_LEAD_TRIAGE' ||
      action === 'EDIT_CONTACT_STATUS' ||
      action === 'GENERATE_QUOTATION' ||
      action === 'EDIT_QUOTATION_DRAFT'
    ) {
      return 'text-[#EE6F57]';
    }
    return 'text-[#171717]';
  };

  return (
    <div className="space-y-4">
      {/* Immutable Append-Only Compliance Bar & Admin-Exclusive Export Controls */}
      <div className="bg-white border border-[#E3E3E3] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-[#171717]">
              Immutable Append-Only Audit Trail · Asia/Kuala_Lumpur (UTC+8)
            </p>
            <p className="text-xs text-neutral-500">
              All staff navigation and workflow actions are permanently recorded. Deleting, altering,
              or truncating audit records is strictly prohibited for all roles including Administrators.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdministrator ? (
            <>
              <button
                type="button"
                disabled={exportingFormat !== null}
                onClick={() => handleExport('csv')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {exportingFormat === 'csv' ? 'Exporting CSV...' : 'Download Audit Log (CSV)'}
              </button>
              <button
                type="button"
                disabled={exportingFormat !== null}
                onClick={() => handleExport('json')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#171717] bg-white border border-[#E3E3E3] hover:border-[#CB3737] hover:text-[#CB3737] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <FileJson className="w-3.5 h-3.5" />
                {exportingFormat === 'json' ? 'Exporting JSON...' : 'Export Audit Trail (JSON)'}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                title="Export restricted to System Administrator / Manager"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-400 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg cursor-not-allowed whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                Download Audit Log (CSV)
              </button>
              <button
                type="button"
                disabled
                title="Export restricted to System Administrator / Manager"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-400 bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg cursor-not-allowed whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                Export Audit Trail (JSON)
              </button>
              <span className="text-[11px] font-medium text-[#CB3737]">
                Export restricted to System Administrator / Manager
              </span>
            </div>
          )}
        </div>
      </div>

      {exportFeedback && (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          {exportFeedback}
        </div>
      )}
      {exportError && (
        <div className="p-3 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
          {exportError}
        </div>
      )}

      {/* Main Audit Trail Table (No Delete / Clear / Reset Buttons) */}
      <div className="bg-white border border-[#E3E3E3] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E3E3E3] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[#171717]">
              User Activity &amp; Compliance Log ({entries.length})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Captures `log_id`, UTC+8 timestamp, staff profile &amp; role, page visited, action
              verb, target ID, and before/after details.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search log ID, user, target, or details..."
                className="pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#E3E3E3] rounded-lg focus:outline-none focus:bg-white focus:border-[#CB3737]"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as 'ALL' | AuditAction)}
              className="px-3 py-1.5 text-xs bg-white border border-[#E3E3E3] rounded-lg text-neutral-700"
            >
              <option value="ALL">All Actions ({entries.length})</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-1.5">
            <p className="text-sm font-semibold text-[#171717]">No audit events recorded yet</p>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Every page visit, lead triage, SLA update, scope submission, validity amendment,
              Administrator approval, and dispatch will append here immutably.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E3E3E3] text-xs font-medium text-neutral-500">
                  <th className="py-3 px-5">Log ID &amp; Timestamp (UTC+8)</th>
                  <th className="py-3 px-4">Staff &amp; Role</th>
                  <th className="py-3 px-4">Page Visited</th>
                  <th className="py-3 px-4">Action Taken</th>
                  <th className="py-3 px-4">Target ID</th>
                  <th className="py-3 px-5">Action Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E3E3] text-xs">
                {filtered.map((entry) => (
                  <tr key={entry.log_id} className="hover:bg-[#FAFAFA] align-top">
                    <td className="py-3 px-5 whitespace-nowrap font-mono tabular-nums">
                      <p className="font-semibold text-[#171717]">{entry.log_id}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5" title={entry.timestamp}>
                        {formatDateTime(entry.timestamp)} MYT
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-medium text-[#171717]">{entry.user_name}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        <span
                          className={
                            entry.user_role === 'administrator'
                              ? 'text-[#CB3737] font-semibold'
                              : 'text-neutral-600'
                          }
                        >
                          {entry.user_role}
                        </span>
                        <span> · {entry.department}</span>
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-neutral-700">
                      {entry.page_visited}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] font-semibold">
                      <span className={actionTone(entry.action_taken)}>{entry.action_taken}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-neutral-700">
                      {entry.target_id || '—'}
                    </td>
                    <td className="py-3 px-5 text-neutral-600 leading-relaxed max-w-md">
                      {entry.action_details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
