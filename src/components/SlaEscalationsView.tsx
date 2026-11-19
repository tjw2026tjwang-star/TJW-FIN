import { useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { DEPARTMENT_LABELS, type Lead, type OrgConfig, type UserProfile } from '../types';
import { evaluateLeadSla, formatDateShort, formatDateTime } from '../lib/sla';
import { runSlaEscalationSweep } from '../lib/firestoreService';

interface SlaEscalationsViewProps {
  leads: Lead[];
  orgConfig: OrgConfig;
  actor: UserProfile;
  onSelectLead: (lead: Lead) => void;
}

export function SlaEscalationsView({
  leads,
  orgConfig,
  actor,
  onSelectLead,
}: SlaEscalationsViewProps) {
  const [sweeping, setSweeping] = useState(false);
  const [sweepMessage, setSweepMessage] = useState<string | null>(null);

  const evaluations = useMemo(() => {
    return leads.map((lead) => ({
      lead,
      sla: evaluateLeadSla(lead, orgConfig.slaWorkingDays, orgConfig.publicHolidays),
    }));
  }, [leads, orgConfig]);

  const pendingList = useMemo(
    () =>
      evaluations
        .filter((e) => e.lead.contactStatus === 'Pending Contact')
        .sort((a, b) => b.sla.workingDaysElapsed - a.sla.workingDaysElapsed),
    [evaluations]
  );

  const breachedPending = pendingList.filter((e) => e.sla.isBreached);
  const approachingPending = pendingList.filter((e) => e.sla.isApproaching);
  const contactedLeads = evaluations.filter((e) => e.lead.contactStatus === 'Contacted');
  const compliantContacted = contactedLeads.filter((e) => !e.sla.isBreached);
  const adherenceRate =
    contactedLeads.length > 0
      ? Math.round((compliantContacted.length / contactedLeads.length) * 100)
      : 100;

  const avgWorkingDaysToContact =
    contactedLeads.length > 0
      ? (
          contactedLeads.reduce((acc, item) => acc + item.sla.workingDaysElapsed, 0) /
          contactedLeads.length
        ).toFixed(1)
      : '0.0';

  const handleRunSweep = async () => {
    setSweeping(true);
    setSweepMessage(null);
    try {
      const count = await runSlaEscalationSweep(leads, actor, orgConfig);
      setSweepMessage(
        count > 0
          ? `09:00 AM Escalation Sweep dispatched ${count} high-priority SLA alert${count === 1 ? '' : 's'} to assigned PICs with CC to Finance Leadership.`
          : '09:00 AM Escalation Sweep complete — no pending leads currently breach the working-day SLA threshold.'
      );
    } catch (err) {
      setSweepMessage(
        err instanceof Error ? err.message : 'Unable to complete escalation sweep.'
      );
    } finally {
      setSweeping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">SLA Adherence Rate</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {adherenceRate}%
          </p>
          <p className="text-xs text-slate-500 mt-1">Target ≥ 95% within {orgConfig.slaWorkingDays}d</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Active Uncontacted Breaches</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              breachedPending.length > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {breachedPending.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">≥ {orgConfig.slaWorkingDays} working days elapsed</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Approaching Deadline</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              approachingPending.length > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {approachingPending.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Within 1 working day of breach</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Avg. Contact Turnaround</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {avgWorkingDaysToContact}d
          </p>
          <p className="text-xs text-slate-500 mt-1">Excludes weekends &amp; MY holidays</p>
        </div>
      </div>

      {/* Step 5 Escalation Sweep Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Step 5: Automated 09:00 AM SLA Reminder &amp; Escalation Engine
          </h2>
          <p className="text-xs text-slate-600">
            Evaluates working days elapsed using the active {orgConfig.publicHolidays.length}-day
            Malaysian Public Holiday calendar. Sends high-priority alerts to PICs and CCs Finance
            Management for breaches ≥ {orgConfig.slaWorkingDays} working days.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRunSweep}
          disabled={sweeping}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {sweeping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BellRing className="w-3.5 h-3.5" />
          )}
          Run 09:00 AM SLA Sweep Now
        </button>
      </div>

      {sweepMessage && (
        <div className="p-3.5 text-xs bg-slate-900 text-white rounded-lg">{sweepMessage}</div>
      )}

      {/* Pending Outreach Queue Ranked by SLA Exposure */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Uncontacted Leads — Working-Day Exposure Queue
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {pendingList.length} pending contact
          </span>
        </div>

        {pendingList.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">All leads have been contacted</p>
            <p className="text-xs text-slate-500">Zero pending outreach items awaiting SLA verification.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Lead &amp; Entity</th>
                  <th className="py-3 px-4">Department PIC</th>
                  <th className="py-3 px-4">Received</th>
                  <th className="py-3 px-4 text-right">Working Days</th>
                  <th className="py-3 px-4">SLA State</th>
                  <th className="py-3 px-4">Escalation Log</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {pendingList.map(({ lead, sla }) => (
                  <tr
                    key={lead.id}
                    className={
                      sla.isBreached
                        ? 'bg-red-50/45 hover:bg-red-50/75 transition-colors'
                        : 'hover:bg-slate-50 transition-colors'
                    }
                  >
                    <td className="py-3.5 px-6">
                      <p className="font-semibold text-slate-900">{lead.companyName}</p>
                      <p className="text-slate-500 mt-0.5 font-mono tabular-nums">
                        {lead.leadCode} · <span className="font-sans">{lead.contactPerson}</span>
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-800">{lead.assignedPicName}</p>
                      <p className="text-slate-500 mt-0.5">{DEPARTMENT_LABELS[lead.assignedDept]}</p>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDateShort(lead.receivedAtIso)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums">
                      <span
                        className={
                          sla.isBreached
                            ? 'text-red-700'
                            : sla.isApproaching
                              ? 'text-amber-700'
                              : 'text-slate-900'
                        }
                      >
                        {sla.workingDaysElapsed} / {orgConfig.slaWorkingDays}d
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {sla.isBreached ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Breached
                        </span>
                      ) : sla.isApproaching ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          Approaching
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-700">Within SLA</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {lead.escalationCount > 0 ? (
                        <span className="font-mono tabular-nums">
                          {lead.escalationCount} alert{lead.escalationCount === 1 ? '' : 's'} ·{' '}
                          {formatDateTime(lead.escalationSentAtIso)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not escalated</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectLead(lead)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Log Outreach
                      </button>
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
