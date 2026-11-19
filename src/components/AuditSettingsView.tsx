import { useEffect, useState } from 'react';
import { Calendar, Database, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  type AuditLog,
  type Department,
  type OrgConfig,
  type UserProfile,
} from '../types';
import { saveOrgConfig } from '../lib/firestoreService';
import { seedWorkspaceSamples } from '../lib/sampleData';

interface AuditSettingsViewProps {
  auditLogs: AuditLog[];
  orgConfig: OrgConfig;
  actor: UserProfile;
  onConfigSaved: (next: OrgConfig) => void;
}

const ACTION_LABELS: Record<AuditLog['action'], string> = {
  LEAD_INGESTED: 'Lead Ingested & Routed',
  OUTREACH_LOGGED: 'Outreach Logged',
  SLA_ESCALATED: 'SLA Escalation Dispatched',
  SCOPE_RECORDED: 'Scope Recorded',
  QUOTATION_GENERATED: 'AI Quotation Generated',
  QUOTATION_SUBMITTED: 'Submitted for Approval',
  QUOTATION_APPROVED: 'Finance Gate Approved',
  QUOTATION_REJECTED: 'Finance Gate Rejected',
  QUOTATION_DISPATCHED: 'Proposal Dispatched',
  CONFIG_UPDATED: 'Policy Config Updated',
};

export function AuditSettingsView({
  auditLogs,
  orgConfig,
  actor,
  onConfigSaved,
}: AuditSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'audit' | 'settings'>('audit');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  // Settings form state
  const [slaWorkingDays, setSlaWorkingDays] = useState(orgConfig.slaWorkingDays);
  const [holidays, setHolidays] = useState<string[]>(orgConfig.publicHolidays);
  const [newHoliday, setNewHoliday] = useState('');
  const [departmentPics, setDepartmentPics] = useState(orgConfig.departmentPics);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setSlaWorkingDays(orgConfig.slaWorkingDays);
    setHolidays(orgConfig.publicHolidays);
    setDepartmentPics(orgConfig.departmentPics);
  }, [orgConfig]);

  const filteredLogs =
    actionFilter === 'ALL'
      ? auditLogs
      : auditLogs.filter((log) => log.action === actionFilter);

  const handleAddHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday)) {
      setFeedback({ type: 'error', text: 'Enter holiday date in YYYY-MM-DD format.' });
      return;
    }
    if (!holidays.includes(newHoliday)) {
      setHolidays((prev) => [...prev, newHoliday].sort());
    }
    setNewHoliday('');
    setFeedback(null);
  };

  const handleSaveConfig = async () => {
    if (actor.role !== 'admin') {
      setFeedback({ type: 'error', text: 'Only System Administrators can modify operational settings.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const next: Omit<OrgConfig, 'updatedAt' | 'updatedBy'> = {
        slaWorkingDays: Math.max(1, Math.min(30, Number(slaWorkingDays) || 4)),
        publicHolidays: holidays,
        departmentPics,
        approverIds: orgConfig.approverIds,
      };
      await saveOrgConfig(next, actor);
      onConfigSaved({ ...next, updatedBy: actor.uid });
      setFeedback({ type: 'success', text: 'Operational SLA policy and PIC assignments saved.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSeedSamples = async () => {
    setSeeding(true);
    setFeedback(null);
    try {
      await seedWorkspaceSamples(actor, orgConfig);
      setFeedback({
        type: 'success',
        text: 'Loaded 5 Malaysian SME sample leads across all workflow stages (including SLA breach & pending approval).',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load sample leads.',
      });
    } finally {
      setSeeding(false);
    }
  };

  const formatTimestamp = (log: AuditLog) => {
    if (!log.createdAt) return 'Just now';
    const d = log.createdAt.toDate();
    return d.toLocaleString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Immutable Audit Trail
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            SLA &amp; Department Settings
          </button>
        </div>

        {activeTab === 'audit' && (
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="ALL">All Audit Events ({auditLogs.length})</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 text-xs rounded-lg border ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {activeTab === 'audit' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Immutable Governance &amp; Approval Audit Log
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Append-only ledger enforced by database rules. Records every triage, escalation,
                finance sign-off, and client dispatch.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredLogs.length} entries
            </span>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No audit records match the selected filter yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-3 px-6">Timestamp</th>
                    <th className="py-3 px-4">Event</th>
                    <th className="py-3 px-4">Record</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-6">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-6 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {formatTimestamp(log)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        {ACTION_LABELS[log.action] || log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {log.entityLabel}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {log.actorName} · {log.actorRole}
                      </td>
                      <td className="py-3 px-6 text-slate-600 leading-relaxed max-w-md">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* SLA & PIC Routing */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                SLA Policy &amp; Department PIC Routing
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure working-day SLA threshold and designated PIC labels for the 5 service
                verticals.
              </p>
            </div>

            <div className="max-w-xs">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Outreach SLA Threshold (Working Days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                disabled={actor.role !== 'admin'}
                value={slaWorkingDays}
                onChange={(e) => setSlaWorkingDays(Number(e.target.value) || 4)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-700">
                Department PIC Assignment Directory
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {DEPARTMENTS.map((dept: Department) => (
                  <div
                    key={dept}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        {DEPARTMENT_LABELS[dept]}
                      </p>
                      <p className="text-xs text-slate-500">{departmentPics[dept]?.title}</p>
                    </div>
                    <input
                      type="text"
                      disabled={actor.role !== 'admin'}
                      value={departmentPics[dept]?.name || ''}
                      onChange={(e) =>
                        setDepartmentPics((prev) => ({
                          ...prev,
                          [dept]: { ...prev[dept], name: e.target.value },
                        }))
                      }
                      className="sm:w-64 px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleSeedSamples}
                disabled={seeding}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {seeding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Database className="w-3.5 h-3.5" />
                )}
                Populate Sample Malaysian Leads
              </button>

              {actor.role === 'admin' && (
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Policy Changes
                </button>
              )}
            </div>
          </div>

          {/* Malaysian Public Holiday Calendar */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-600" />
                  Malaysian Public Holidays
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Excluded automatically from 4-day working-day SLA calculations.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {holidays.length} dates
              </span>
            </div>

            {actor.role === 'admin' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={newHoliday}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddHoliday}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {holidays.map((dateStr) => (
                <div
                  key={dateStr}
                  className="px-3.5 py-2 flex items-center justify-between text-xs"
                >
                  <span className="font-mono tabular-nums text-slate-700">{dateStr}</span>
                  {actor.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setHolidays((prev) => prev.filter((d) => d !== dateStr))}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label={`Remove holiday ${dateStr}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
