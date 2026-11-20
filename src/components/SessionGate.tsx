import { useState } from 'react';
import { ArrowRight, Briefcase, Clock, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import {
  DEPARTMENTS,
  DEPARTMENT_FULL_NAMES,
  normalizeSessionRole,
  type Department,
  type UserRole,
  type UserSession,
} from '../types';
import { BrandLogo } from './BrandLogo';

interface SessionGateProps {
  onStartSession: (session: UserSession) => void;
  timeoutNotice?: string | null;
}

export function SessionGate({ onStartSession, timeoutNotice }: SessionGateProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState<Department>('Finance');
  const [role, setRole] = useState<UserRole>('Administrator');
  const [error, setError] = useState<string | null>(null);

  const isFinanceDepartment = department === 'Finance';
  const effectiveRole: UserRole = normalizeSessionRole(department, role);

  const handleDepartmentChange = (nextDept: Department) => {
    setDepartment(nextDept);
    if (nextDept !== 'Finance') {
      setRole('User');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName) {
      setError('Enter your full name to start a workspace session.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter a valid work email address.');
      return;
    }

    const enforcedRole = normalizeSessionRole(department, role);

    onStartSession({
      name: cleanName,
      email: cleanEmail,
      department,
      role: enforcedRole,
      signedInAt: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-between">
      <header className="w-full bg-white border-b border-[#E3E3E3]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <BrandLogo compact />
          <span className="text-xs font-medium text-neutral-500 hidden sm:inline whitespace-nowrap">
            Finance Department · Internal Operations Portal
          </span>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6 space-y-6">
          <p className="text-xs font-medium text-[#CB3737]">
            T.J. Wang Finance Department · 8-Step Operations Engine
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#171717] leading-[1.15]">
            Lead triage, 4-day SLA control, and approval-gated quotations.
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 leading-relaxed max-w-lg">
            Manage incoming client inquiries across Company Secretarial, Accounting, Statutory
            Audit, Corporate &amp; Personal Tax, Payroll, and Finance Advisory (FP&amp;A) with
            3-tier role governance, 10-minute idle security timeout, and append-only audit logging.
          </p>

          <div className="pt-4 border-t border-[#E3E3E3] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <p className="font-semibold text-[#171717] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#CB3737] shrink-0" />
                Administrator
              </p>
              <p className="text-neutral-600 leading-relaxed">
                Finance only. Full access, exclusive quotation approval, validity amendments, and
                Audit Trail export.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[#171717] flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-[#EE6F57] shrink-0" />
                Executive
              </p>
              <p className="text-neutral-600 leading-relaxed">
                Finance only. Operational workflow plus Step 6 quotation drafting &amp; editing.
                Approval &amp; audit export locked.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[#171717] flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-neutral-600 shrink-0" />
                User
              </p>
              <p className="text-neutral-600 leading-relaxed">
                All non-Finance depts &amp; general Finance staff. Steps 1–4 triage, SLA &amp; scope
                only. Quotation drafting locked.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#E3E3E3] rounded-xl p-6 sm:p-8 space-y-5"
          >
            <div className="space-y-1 pb-2 border-b border-[#E3E3E3]">
              <h2 className="text-base font-semibold text-[#171717]">Staff Session Access</h2>
              <p className="text-xs text-neutral-500">
                Enter your staff details and department to open your local workspace. Non-Finance
                departments are strictly locked to User access.
              </p>
            </div>

            {timeoutNotice && (
              <div
                role="alert"
                className="p-3.5 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/30 rounded-lg flex items-start gap-2.5"
              >
                <Clock className="w-4 h-4 text-[#CB3737] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-[#171717]">Session Terminated (Idle Timeout)</p>
                  <p className="text-[#CB3737] leading-relaxed">{timeoutNotice}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="staff-name"
                  className="block text-xs font-medium text-neutral-700 mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="staff-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-email"
                  className="block text-xs font-medium text-neutral-700 mb-1.5"
                >
                  Work Email
                </label>
                <input
                  id="staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@tjwang.com.my"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-dept"
                  className="block text-xs font-medium text-neutral-700 mb-1.5"
                >
                  Department
                </label>
                <select
                  id="staff-dept"
                  value={department}
                  onChange={(e) => handleDepartmentChange(e.target.value as Department)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept} — {DEPARTMENT_FULL_NAMES[dept]}
                      {dept === 'Finance' ? ' (Admin / Executive / User)' : ' (User Only)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="staff-role"
                    className="block text-xs font-medium text-neutral-700"
                  >
                    Access Role (3-Tier Policy)
                  </label>
                  {!isFinanceDepartment && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#CB3737]">
                      <Lock className="w-3 h-3" />
                      Locked to User ({department})
                    </span>
                  )}
                </div>

                <select
                  id="staff-role"
                  value={effectiveRole}
                  disabled={!isFinanceDepartment}
                  onChange={(e) => {
                    if (!isFinanceDepartment) return;
                    setRole(e.target.value as UserRole);
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737] disabled:bg-[#FAFAFA] disabled:text-neutral-600 disabled:cursor-not-allowed"
                >
                  <option value="Administrator" disabled={!isFinanceDepartment}>
                    Administrator — Full access, quotation approval, validity amend &amp; audit export (Finance only)
                  </option>
                  <option value="Executive" disabled={!isFinanceDepartment}>
                    Executive — Operations + quotation drafting &amp; editing, no approval/export (Finance only)
                  </option>
                  <option value="User">
                    User — Operational lead intake, SLA contact tracking &amp; scope logging only
                  </option>
                </select>

                <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
                  {!isFinanceDepartment ? (
                    <>
                      Staff outside the <strong>Finance</strong> department are restricted to the{' '}
                      <strong>User</strong> role. Quotation drafting, approval, and audit log export
                      require Finance Department authorization.
                    </>
                  ) : effectiveRole === 'Administrator' ? (
                    <>
                      <strong>Administrator</strong> (Finance): Full operational control, Step 6
                      quotation drafting, exclusive Step 7 approval &amp; validity amendment, and
                      CSV/JSON audit export.
                    </>
                  ) : effectiveRole === 'Executive' ? (
                    <>
                      <strong>Executive</strong> (Finance): Full operational intake &amp; Step 6
                      quotation drafting/editing. Step 7 quotation approval and audit trail export
                      remain locked.
                    </>
                  ) : (
                    <>
                      <strong>User</strong> (Finance): Operational triage, contact SLA updates, and
                      scope logging only. Step 6 quotation drafting, Step 7 approval, and audit
                      export are locked.
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#CB3737] hover:bg-[#B02D2D] rounded-lg transition-colors cursor-pointer"
            >
              Enter Finance Operations Workspace
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      <footer className="w-full bg-white border-t border-[#E3E3E3]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-500">
          <span>T.J. Wang Finance Department</span>
          <span>Co Sec · Accounting · Statutory Audit · Tax · Payroll · Finance</span>
        </div>
      </footer>
    </div>
  );
}
