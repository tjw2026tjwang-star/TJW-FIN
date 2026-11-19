import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  BellRing,
  CheckSquare,
  Database,
  FileSpreadsheet,
  Inbox,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  ensureUserProfile,
  loadOrgConfig,
} from './lib/firestoreService';
import {
  buildDefaultOrgConfig,
  evaluateLeadSla,
  formatDateShort,
  formatMyr,
  getDeptShortCode,
} from './lib/sla';
import { seedWorkspaceSamples } from './lib/sampleData';
import {
  DEPARTMENTS,
  type AuditLog,
  type Department,
  type Lead,
  type OrgConfig,
  type Quotation,
  type UserProfile,
  type WorkflowStage,
} from './types';
import { SignInGate } from './components/SignInGate';
import { InboundTriageModal } from './components/InboundTriageModal';
import { LeadDetailDrawer } from './components/LeadDetailDrawer';
import { QuotationWorkbench } from './components/QuotationWorkbench';
import { SlaEscalationsView } from './components/SlaEscalationsView';
import { AuditSettingsView } from './components/AuditSettingsView';

type NavSection = 'leads' | 'sla' | 'quotations' | 'approvals' | 'audit';

const SECTION_META: Record<NavSection, { breadcrumb: string; title: string }> = {
  leads: { breadcrumb: 'Operations / Lead Triage Pipeline', title: 'Lead Triage & Outreach Pipeline' },
  sla: { breadcrumb: 'Operations / SLA Escalations', title: '4-Day Working-Day SLA Monitor' },
  quotations: { breadcrumb: 'Operations / Quotations', title: 'AI Quotation Workbench' },
  approvals: { breadcrumb: 'Governance / Finance Approval Queue', title: 'Finance Approval Gate' },
  audit: { breadcrumb: 'Governance / Audit & Settings', title: 'Audit Trail & Policy Configuration' },
};

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);

  // Realtime Firestore state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Navigation & UI state
  const [activeNav, setActiveNav] = useState<NavSection>('leads');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);
  const [roleViewOverride, setRoleViewOverride] = useState<'admin' | 'approver' | 'pic'>('admin');
  const [seedingSamples, setSeedingSamples] = useState(false);

  // Lead table filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<'ALL' | Department>('ALL');
  const [stageFilter, setStageFilter] = useState<'ALL' | WorkflowStage>('ALL');

  // 1. Auth & User Profile Bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setProfile(null);
        setOrgConfig(null);
        setLeads([]);
        setQuotations([]);
        setAuditLogs([]);
        setAuthReady(true);
        setDataLoading(false);
        return;
      }

      try {
        const userProf = await ensureUserProfile(firebaseUser);
        setProfile(userProf);
        setRoleViewOverride(userProf.role);
        const cfg = await loadOrgConfig(userProf);
        setOrgConfig(cfg);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Unable to initialize user session.'
        );
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // 2. Realtime Firestore Subscriptions (only when authenticated)
  useEffect(() => {
    if (!authReady || !profile) return;

    setDataLoading(true);
    const isBootstrapAdmin =
      profile.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

    const leadsCol = collection(db, 'leads');
    const leadsQuery = isBootstrapAdmin
      ? query(leadsCol)
      : profile.role === 'approver' || profile.role === 'admin'
        ? query(leadsCol, where('approverIds', 'array-contains', profile.uid))
        : query(leadsCol, where('assignedPicId', '==', profile.uid));

    const quotesCol = collection(db, 'quotations');
    const quotesQuery = isBootstrapAdmin
      ? query(quotesCol)
      : profile.role === 'approver' || profile.role === 'admin'
        ? query(quotesCol, where('approverIds', 'array-contains', profile.uid))
        : query(quotesCol, where('assignedPicId', '==', profile.uid));

    const logsCol = collection(db, 'auditLogs');
    const logsQuery = isBootstrapAdmin
      ? query(logsCol)
      : profile.role === 'approver' || profile.role === 'admin'
        ? query(logsCol, where('approverIds', 'array-contains', profile.uid))
        : query(logsCol, where('actorUid', '==', profile.uid));

    let leadsLoaded = false;
    let quotesLoaded = false;
    const markReady = () => {
      if (leadsLoaded && quotesLoaded) setDataLoading(false);
    };

    const unsubLeads = onSnapshot(
      leadsQuery,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, 'id'>) }))
          .sort((a, b) => (b.receivedAtIso || '').localeCompare(a.receivedAtIso || ''));
        setLeads(items);
        leadsLoaded = true;
        markReady();
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'leads');
      }
    );

    const unsubQuotes = onSnapshot(
      quotesQuery,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Quotation, 'id'>) }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis() ?? 0;
            const tb = b.createdAt?.toMillis() ?? 0;
            return tb - ta;
          });
        setQuotations(items);
        quotesLoaded = true;
        markReady();
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'quotations');
      }
    );

    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis() ?? Date.now();
            const tb = b.createdAt?.toMillis() ?? Date.now();
            return tb - ta;
          });
        setAuditLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'auditLogs');
      }
    );

    return () => {
      unsubLeads();
      unsubQuotes();
      unsubLogs();
    };
  }, [authReady, profile]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const activeConfig = useMemo(() => {
    if (orgConfig) return orgConfig;
    if (profile) return buildDefaultOrgConfig(profile.uid, profile.displayName);
    return buildDefaultOrgConfig('default', 'Operations');
  }, [orgConfig, profile]);

  const leadsById = useMemo(() => {
    const map: Record<string, Lead> = {};
    for (const lead of leads) map[lead.id] = lead;
    return map;
  }, [leads]);

  const quotationByLeadId = useMemo(() => {
    const map: Record<string, Quotation> = {};
    for (const q of quotations) {
      if (!map[q.leadId]) map[q.leadId] = q;
    }
    return map;
  }, [quotations]);

  const slaEvaluations = useMemo(() => {
    const map: Record<string, ReturnType<typeof evaluateLeadSla>> = {};
    for (const lead of leads) {
      map[lead.id] = evaluateLeadSla(
        lead,
        activeConfig.slaWorkingDays,
        activeConfig.publicHolidays
      );
    }
    return map;
  }, [leads, activeConfig]);

  const activeBreachCount = useMemo(
    () =>
      leads.filter(
        (l) => l.contactStatus === 'Pending Contact' && slaEvaluations[l.id]?.isBreached
      ).length,
    [leads, slaEvaluations]
  );

  const pendingApprovalsCount = useMemo(
    () => quotations.filter((q) => q.status === 'Pending Approval').length,
    [quotations]
  );

  const totalPipelineValueMyr = useMemo(
    () => quotations.reduce((acc, q) => acc + (q.totalContractValueMyr || 0), 0),
    [quotations]
  );

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (deptFilter !== 'ALL' && lead.assignedDept !== deptFilter) return false;
      if (stageFilter !== 'ALL' && lead.workflowStage !== stageFilter) return false;
      if (!q) return true;
      return (
        lead.companyName.toLowerCase().includes(q) ||
        lead.leadCode.toLowerCase().includes(q) ||
        lead.contactPerson.toLowerCase().includes(q) ||
        lead.assignedPicName.toLowerCase().includes(q) ||
        lead.serviceLines.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [leads, searchQuery, deptFilter, stageFilter]);

  const selectedLead = selectedLeadId ? leadsById[selectedLeadId] || null : null;

  const handleLoadSamples = async () => {
    if (!profile) return;
    setSeedingSamples(true);
    try {
      await seedWorkspaceSamples(profile, activeConfig);
    } finally {
      setSeedingSamples(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
          Loading Meridian Advisory Ops...
        </div>
      </div>
    );
  }

  if (!profile) {
    return <SignInGate onSignIn={handleSignIn} loading={signingIn} error={authError} />;
  }

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: typeof Inbox;
    count?: number;
    alert?: boolean;
  }> = [
    { id: 'leads', label: 'Lead Pipeline', icon: Inbox, count: leads.length },
    {
      id: 'sla',
      label: 'SLA Escalations',
      icon: BellRing,
      count: activeBreachCount,
      alert: activeBreachCount > 0,
    },
    { id: 'quotations', label: 'Quotations', icon: FileSpreadsheet, count: quotations.length },
    {
      id: 'approvals',
      label: 'Approval Queue',
      icon: CheckSquare,
      count: pendingApprovalsCount,
      alert: pendingApprovalsCount > 0,
    },
    { id: 'audit', label: 'Audit & Settings', icon: Settings },
  ];

  const effectiveRoleView = profile.role === 'admin' ? roleViewOverride : profile.role;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-20">
        <div className="px-6 h-16 border-b border-slate-200 flex items-center">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Meridian Ops
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white font-medium'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active
                        ? 'text-slate-300'
                        : item.alert
                          ? 'text-red-700 font-semibold'
                          : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{profile.displayName}</p>
            <p className="text-xs text-slate-500 truncate">
              {profile.role === 'admin'
                ? 'System Administrator'
                : profile.role === 'approver'
                  ? 'Finance Approver'
                  : `${profile.department} PIC`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/40 flex">
          <div className="w-64 bg-white h-full flex flex-col border-r border-slate-200">
            <div className="px-5 h-16 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-base font-bold text-slate-900">Meridian Ops</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500"
                aria-label="Close navigation menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm rounded-lg ${
                      active ? 'bg-slate-900 text-white font-medium' : 'text-slate-600'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </span>
                    {typeof item.count === 'number' && (
                      <span className="font-mono text-xs tabular-nums">{item.count}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Contextual Top Bar (Strict 3-zone / Breadcrumb + Single Primary CTA) */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-xs font-medium text-slate-500 truncate">
              {SECTION_META[activeNav].breadcrumb}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setTriageOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Ingest Email Lead
          </button>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 px-4 sm:px-8 py-7 max-w-[1380px] w-full mx-auto space-y-6">
          {/* Page Title & Workspace Role Perspective Control */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                {SECTION_META[activeNav].title}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Malaysian Corporate Advisory Operations · {activeConfig.slaWorkingDays}-Working-Day
                Outreach SLA · Hard Finance Approval Gating
              </p>
            </div>

            {profile.role === 'admin' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">View as:</span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'admin', label: 'Admin' },
                      { id: 'approver', label: 'Finance Approver' },
                      { id: 'pic', label: 'Dept PIC' },
                    ] as const
                  ).map((roleOpt) => (
                    <button
                      key={roleOpt.id}
                      type="button"
                      onClick={() => setRoleViewOverride(roleOpt.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        roleViewOverride === roleOpt.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {roleOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* VIEW 1: LEAD TRIAGE PIPELINE */}
          {activeNav === 'leads' && (
            <div className="space-y-6">
              {/* 4-Column Flat KPI Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Total Leads Tracked</p>
                  <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {leads.length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Across 5 service verticals</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">SLA Breaches (&ge;{activeConfig.slaWorkingDays}d)</p>
                  <p
                    className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                      activeBreachCount > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {activeBreachCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Uncontacted past SLA limit</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Pending Finance Approval</p>
                  <p
                    className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                      pendingApprovalsCount > 0 ? 'text-amber-700' : 'text-slate-900'
                    }`}
                  >
                    {pendingApprovalsCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Awaiting Step 7 sign-off</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Quoted Year-1 Pipeline</p>
                  <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {formatMyr(totalPipelineValueMyr)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {quotations.filter((q) => q.status === 'Quotation Sent').length} dispatched
                  </p>
                </div>
              </div>

              {/* Active SLA Escalation Alert Strip */}
              {activeBreachCount > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs text-red-900">
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>
                      <strong>
                        {activeBreachCount} uncontacted lead{activeBreachCount === 1 ? '' : 's'}
                      </strong>{' '}
                      exceeded the {activeConfig.slaWorkingDays}-working-day outreach SLA. Review
                      escalation alerts and trigger PIC follow-up.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNav('sla')}
                    className="px-3.5 py-1.5 text-xs font-semibold text-red-800 bg-white border border-red-200 rounded-lg hover:bg-red-100/60 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Open SLA Escalations
                  </button>
                </div>
              )}

              {/* Search & Filter Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search company, lead code, PIC, or contact..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-400"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setDeptFilter('ALL')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          deptFilter === 'ALL'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All Depts
                      </button>
                      {DEPARTMENTS.map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => setDeptFilter(dept)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            deptFilter === dept
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {getDeptShortCode(dept)}
                        </button>
                      ))}
                    </div>

                    <select
                      value={stageFilter}
                      onChange={(e) => setStageFilter(e.target.value as 'ALL' | WorkflowStage)}
                      className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                    >
                      <option value="ALL">All Stages</option>
                      <option value="Outreach">Outreach</option>
                      <option value="Scope">Scope</option>
                      <option value="Quotation">Quotation</option>
                      <option value="Approval">Approval</option>
                      <option value="Dispatched">Dispatched</option>
                      <option value="Disqualified">Disqualified</option>
                    </select>
                  </div>
                </div>

                {/* Data Grid / Loading / Empty States */}
                {dataLoading ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3, 4].map((row) => (
                      <div key={row} className="h-11 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : leads.length === 0 ? (
                  <div className="p-12 text-center space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        No corporate advisory leads yet
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Ingest your first raw client email with the AI Triage Router or populate
                        five sample Malaysian SME leads spanning all 8 workflow steps.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setTriageOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Ingest First Email Lead
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadSamples}
                        disabled={seedingSamples}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        {seedingSamples ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Database className="w-3.5 h-3.5" />
                        )}
                        Load Sample Malaysian Leads
                      </button>
                    </div>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No leads match your current search or department filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                          <th className="py-3 px-5">Lead &amp; Entity</th>
                          <th className="py-3 px-4">Service Lines &amp; PIC</th>
                          <th className="py-3 px-4">Received</th>
                          <th className="py-3 px-4">SLA Monitor</th>
                          <th className="py-3 px-4">Workflow Stage</th>
                          <th className="py-3 px-4 text-right">Quotation</th>
                          <th className="py-3 px-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredLeads.map((lead) => {
                          const sla = slaEvaluations[lead.id];
                          const quote = quotationByLeadId[lead.id];
                          return (
                            <tr
                              key={lead.id}
                              onClick={() => setSelectedLeadId(lead.id)}
                              className={`cursor-pointer transition-colors ${
                                sla?.isBreached && lead.contactStatus === 'Pending Contact'
                                  ? 'bg-red-50/40 hover:bg-red-50/75'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-3.5 px-5">
                                <p className="font-semibold text-slate-900">{lead.companyName}</p>
                                <p className="text-slate-500 mt-0.5 font-mono tabular-nums">
                                  {lead.leadCode} ·{' '}
                                  <span className="font-sans">{lead.contactPerson}</span>
                                </p>
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-medium text-slate-800">{lead.assignedPicName}</p>
                                <p className="text-slate-500 mt-0.5">
                                  {lead.serviceLines.map(getDeptShortCode).join(' · ')}
                                </p>
                              </td>
                              <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                {formatDateShort(lead.receivedAtIso)}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                                <span
                                  className={`font-sans font-semibold ${
                                    sla?.isBreached
                                      ? 'text-red-700'
                                      : sla?.isApproaching
                                        ? 'text-amber-700'
                                        : sla?.effectiveStatus === 'Compliant'
                                          ? 'text-emerald-700'
                                          : 'text-slate-600'
                                  }`}
                                >
                                  {sla?.label}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="font-medium text-slate-800">
                                  {lead.workflowStage}
                                </span>
                                <span className="text-slate-400"> · {lead.contactStatus}</span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                {quote ? (
                                  <div>
                                    <p className="font-semibold text-slate-900">
                                      {formatMyr(quote.totalContractValueMyr)}
                                    </p>
                                    <p className="font-sans text-slate-500 mt-0.5">
                                      {quote.status}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedLeadId(lead.id);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 2: STEP 5 SLA ESCALATIONS */}
          {activeNav === 'sla' && (
            <SlaEscalationsView
              leads={leads}
              orgConfig={activeConfig}
              actor={profile}
              onSelectLead={(lead) => setSelectedLeadId(lead.id)}
            />
          )}

          {/* VIEW 3 & 4: QUOTATION WORKBENCH & FINANCE APPROVAL QUEUE */}
          {(activeNav === 'quotations' || activeNav === 'approvals') && (
            <QuotationWorkbench
              quotations={quotations}
              leadsById={leadsById}
              selectedQuotationId={selectedQuotationId}
              onSelectQuotation={(id) => setSelectedQuotationId(id)}
              actor={profile}
              effectiveRoleView={effectiveRoleView}
              initialFilter={activeNav === 'approvals' ? 'pending_approval' : 'all'}
            />
          )}

          {/* VIEW 5: IMMUTABLE AUDIT TRAIL & OPERATIONS SETTINGS */}
          {activeNav === 'audit' && (
            <AuditSettingsView
              auditLogs={auditLogs}
              orgConfig={activeConfig}
              actor={profile}
              onConfigSaved={(next) => setOrgConfig(next)}
            />
          )}
        </main>
      </div>

      {/* Step 1 Inbound Email AI Triage Modal */}
      <InboundTriageModal
        open={triageOpen}
        onClose={() => setTriageOpen(false)}
        actor={profile}
        orgConfig={activeConfig}
        onLeadCreated={(lead) => {
          setActiveNav('leads');
          setSelectedLeadId(lead.id);
        }}
      />

      {/* Steps 1-6 Lead Detail Workspace Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        linkedQuotation={selectedLead ? quotationByLeadId[selectedLead.id] : undefined}
        actor={profile}
        orgConfig={activeConfig}
        onClose={() => setSelectedLeadId(null)}
        onOpenQuotation={(quotationId) => {
          setSelectedLeadId(null);
          setSelectedQuotationId(quotationId);
          setActiveNav('quotations');
        }}
      />
    </div>
  );
}
