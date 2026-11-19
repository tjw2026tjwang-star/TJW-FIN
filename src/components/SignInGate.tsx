import { ArrowRight, ShieldCheck } from 'lucide-react';

interface SignInGateProps {
  onSignIn: () => void;
  loading: boolean;
  error: string | null;
}

const WORKFLOW_STEPS = [
  {
    index: '01',
    title: 'Inbound Email AI Triage',
    detail: 'Extracts prospect entity details and routes automatically to Co Sec, Accounting, Audit, Tax, or Payroll PICs.',
  },
  {
    index: '02',
    title: '4-Day Working-Day SLA Governance',
    detail: 'Tracks prospect contact timing excluding weekends and Malaysian public holidays, with automated escalation sweeps.',
  },
  {
    index: '03',
    title: 'Malaysian Fee Benchmark Quotations',
    detail: 'Converts PIC discovery scopes into structured setup, monthly, and annual MYR line items with standard exclusions.',
  },
  {
    index: '04',
    title: 'Hard Finance Approval Gate',
    detail: 'Blocks PDF, Email, and WhatsApp proposal dispatch until Finance Leadership explicitly ticks approval with audit logging.',
  },
];

export function SignInGate({ onSignIn, loading, error }: SignInGateProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Meridian Advisory Ops
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap">
            Corporate Advisory &amp; Finance Operations
          </span>
          <button
            type="button"
            onClick={onSignIn}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6 space-y-6">
          <p className="text-xs font-medium text-slate-500">
            Malaysian Corporate Advisory · Five Service Verticals
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12]">
            Lead triage, SLA control, and gated quotations in one workspace.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            Standardize client intake across Company Secretarial, Accounting, Statutory Audit,
            Corporate Tax, and Payroll with automated 4-working-day SLA tracking and mandatory
            Finance Director approval before dispatch.
          </p>

          {error && (
            <div className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onSignIn}
              disabled={loading}
              className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Continue with Google Workspace'}
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              Role-based access &amp; immutable audit trail
            </span>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {WORKFLOW_STEPS.map((step) => (
            <div key={step.index} className="p-6 flex items-start gap-5">
              <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums pt-0.5 shrink-0">
                {step.index}
              </span>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-slate-900">{step.title}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="w-full border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Meridian Corporate Advisory Sdn Bhd</span>
          <span>Co Sec · Accounting · Statutory Audit · Tax · Payroll</span>
        </div>
      </footer>
    </div>
  );
}
