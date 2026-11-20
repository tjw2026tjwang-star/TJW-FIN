import { useState } from 'react';
import { ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import {
  DEPARTMENTS,
  DEPARTMENT_FULL_NAMES,
  type Department,
  type UserRole,
  type UserSession,
} from '../types';
import { BrandLogo } from './BrandLogo';

interface SessionGateProps {
  onStartSession: (session: UserSession) => void;
}

export function SessionGate({ onStartSession }: SessionGateProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState<Department>('Co Sec');
  const [role, setRole] = useState<UserRole>('Administrator');
  const [error, setError] = useState<string | null>(null);

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

    onStartSession({
      name: cleanName,
      email: cleanEmail,
      department,
      role,
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
            zero-cost browser persistence and strict Administrator approval gating before dispatch.
          </p>

          <div className="pt-2 border-t border-[#E3E3E3] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <p className="font-semibold text-[#171717] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#CB3737]" />
                Administrator Role
              </p>
              <p className="text-neutral-600 leading-relaxed">
                Full operational access plus exclusive authority to amend quotation validity and
                approve quotations for dispatch (Steps 7 &amp; 8).
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[#171717] flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#EE6F57]" />
                User Role
              </p>
              <p className="text-neutral-600 leading-relaxed">
                Triage leads, log PIC outreach, record scopes, and draft quotations. Validity
                amendments and approval gate are strictly locked.
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
              <h2 className="text-base font-semibold text-[#171717]">
                Staff Session Access
              </h2>
              <p className="text-xs text-neutral-500">
                Enter your staff details and role to open your local workspace. All records are stored locally in your browser.
              </p>
            </div>

            {error && (
              <div className="p-3 text-xs text-[#CB3737] bg-[#CB3737]/5 border border-[#CB3737]/25 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="staff-name" className="block text-xs font-medium text-neutral-700 mb-1.5">
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
                <label htmlFor="staff-email" className="block text-xs font-medium text-neutral-700 mb-1.5">
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
                <label htmlFor="staff-dept" className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Department
                </label>
                <select
                  id="staff-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as Department)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#CB3737]"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept} — {DEPARTMENT_FULL_NAMES[dept]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Access Role (2-Role Policy)
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['Administrator', 'User'] as const).map((roleOption) => {
                    const active = role === roleOption;
                    return (
                      <button
                        key={roleOption}
                        type="button"
                        onClick={() => setRole(roleOption)}
                        className={`px-3.5 py-2.5 text-left rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'border-[#CB3737] bg-[#CB3737]/5 text-[#171717]'
                            : 'border-[#E3E3E3] bg-white text-neutral-600 hover:border-neutral-400'
                        }`}
                      >
                        <p className="text-xs font-semibold">{roleOption}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          {roleOption === 'Administrator'
                            ? 'Can approve & unlock dispatch'
                            : 'Operations only (approval locked)'}
                        </p>
                      </button>
                    );
                  })}
                </div>
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
