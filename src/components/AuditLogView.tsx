import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { AuditAction, AuditEntry } from '../types';
import { formatDateTime } from '../lib/sla';

interface AuditLogViewProps {
  entries: AuditEntry[];
}

const ACTION_LABELS: Record<AuditAction, string> = {
  SESSION_STARTED: 'Session Started',
  LEAD_CREATED: 'Lead Triaged & Routed',
  OUTREACH_UPDATED: 'Contact Status Updated',
  SLA_REMINDER_LOGGED: 'SLA Escalation Reminder',
  SCOPE_LOGGED: 'Service Scope Logged',
  QUOTATION_GENERATED: 'Quotation Draft Generated',
  QUOTATION_UPDATED: 'Quotation Edited',
  QUOTATION_VALIDITY_AMENDED: 'Validity Amended (Admin)',
  QUOTATION_APPROVED: 'Administrator Approved',
  QUOTATION_APPROVAL_REVOKED: 'Approval Revoked',
  QUOTATION_DISPATCHED: 'Quotation Dispatched',
};

export function AuditLogView({ entries }: AuditLogViewProps) {
  const [actionFilter, setActionFilter] = useState<'ALL' | AuditAction>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (actionFilter !== 'ALL' && entry.action !== actionFilter) return false;
      if (!q) return true;
      return (
        entry.actorName.toLowerCase().includes(q) ||
        entry.entityRef.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q)
      );
    });
  }, [entries, actionFilter, query]);

  return (
    <div className="bg-white border border-[#E3E3E3] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E3E3E3] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[#171717]">
            Audit &amp; Activity Log
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Chronological record of lead triage, outreach timestamps, scope updates, Administrator
            approvals, and client dispatches.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter log entries..."
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
          <p className="text-sm font-semibold text-[#171717]">No activity recorded yet</p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Actions across Steps 1–8 will appear here chronologically with actor name, role, and
            exact timestamp.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E3E3E3] text-xs font-medium text-neutral-500">
                <th className="py-3 px-6">Timestamp</th>
                <th className="py-3 px-4">Activity</th>
                <th className="py-3 px-4">Record Ref</th>
                <th className="py-3 px-4">Actor &amp; Role</th>
                <th className="py-3 px-6">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E3E3] text-xs">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-[#FAFAFA]">
                  <td className="py-3 px-6 font-mono tabular-nums text-neutral-500 whitespace-nowrap">
                    {formatDateTime(entry.timestamp)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#171717] whitespace-nowrap">
                    <span
                      className={
                        entry.action === 'QUOTATION_APPROVED'
                          ? 'text-emerald-700'
                          : entry.action === 'SLA_REMINDER_LOGGED'
                            ? 'text-[#CB3737]'
                            : entry.action === 'QUOTATION_VALIDITY_AMENDED'
                              ? 'text-[#EE6F57]'
                              : 'text-[#171717]'
                      }
                    >
                      {ACTION_LABELS[entry.action]}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-neutral-700 whitespace-nowrap">
                    {entry.entityRef}
                  </td>
                  <td className="py-3 px-4 text-neutral-700 whitespace-nowrap">
                    {entry.actorName} ·{' '}
                    <span
                      className={
                        entry.actorRole === 'Administrator'
                          ? 'text-[#CB3737] font-semibold'
                          : 'text-neutral-500'
                      }
                    >
                      {entry.actorRole}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-neutral-600 leading-relaxed max-w-lg">
                    {entry.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
