import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Zero-cost local append-only audit trail store (initializes completely empty)
const AUDIT_DATA_DIR = path.resolve(__dirname, '.data');
const AUDIT_LOG_FILE = path.join(AUDIT_DATA_DIR, 'audit-logs.jsonl');

interface ImmutableAuditRecord {
  log_id: string;
  timestamp: string;
  user_name: string;
  user_email: string;
  user_role: 'administrator' | 'executive' | 'user';
  department: 'Co Sec' | 'Accounting' | 'Audit' | 'Tax' | 'Payroll' | 'Finance';
  page_visited: string;
  action_taken: string;
  target_id: string;
  action_details: string;
}

const VALID_DEPARTMENTS = new Set(['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance']);

function formatKualaLumpurIso(date: Date = new Date()): string {
  const klMs = date.getTime() + 8 * 60 * 60 * 1000;
  const kl = new Date(klMs);
  const y = kl.getUTCFullYear();
  const m = String(kl.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kl.getUTCDate()).padStart(2, '0');
  const hh = String(kl.getUTCHours()).padStart(2, '0');
  const mm = String(kl.getUTCMinutes()).padStart(2, '0');
  const ss = String(kl.getUTCSeconds()).padStart(2, '0');
  const ms = String(kl.getUTCMilliseconds()).padStart(3, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}+08:00`;
}

function formatKualaLumpurCompactDate(date: Date = new Date()): string {
  const klMs = date.getTime() + 8 * 60 * 60 * 1000;
  const kl = new Date(klMs);
  const y = kl.getUTCFullYear();
  const m = String(kl.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kl.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function readImmutableAuditLogs(): ImmutableAuditRecord[] {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return [];
    const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf8');
    if (!content.trim()) return [];
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const parsed: ImmutableAuditRecord[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as ImmutableAuditRecord;
        if (obj && typeof obj.log_id === 'string') {
          parsed.push(obj);
        }
      } catch {
        // Skip malformed line without ever mutating file
      }
    }
    return parsed.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

function appendImmutableAuditLog(input: Partial<ImmutableAuditRecord>): ImmutableAuditRecord {
  const existing = readImmutableAuditLogs();
  const now = new Date();
  const timestamp =
    typeof input.timestamp === 'string' && input.timestamp.includes('+08:00')
      ? input.timestamp
      : formatKualaLumpurIso(now);
  const logId =
    typeof input.log_id === 'string' && input.log_id.startsWith('LOG-')
      ? input.log_id
      : `LOG-${formatKualaLumpurCompactDate(now)}-${String(existing.length + 1).padStart(3, '0')}`;

  // Prevent duplicate log_id writes
  const duplicate = existing.find((item) => item.log_id === logId);
  if (duplicate) return duplicate;

  const deptNorm = VALID_DEPARTMENTS.has(String(input.department || ''))
    ? (input.department as ImmutableAuditRecord['department'])
    : 'Finance';
  const rawRole = String(input.user_role || '').toLowerCase();
  const roleNorm: ImmutableAuditRecord['user_role'] =
    deptNorm !== 'Finance'
      ? 'user'
      : rawRole === 'administrator'
        ? 'administrator'
        : rawRole === 'executive'
          ? 'executive'
          : 'user';

  const record: ImmutableAuditRecord = {
    log_id: logId,
    timestamp,
    user_name: String(input.user_name || 'Unknown Staff').trim(),
    user_email: String(input.user_email || '').trim(),
    user_role: roleNorm,
    department: deptNorm,
    page_visited: String(input.page_visited || 'Leads Pipeline').trim(),
    action_taken: String(input.action_taken || 'VIEW_PAGE').trim(),
    target_id: String(input.target_id || '—').trim(),
    action_details: String(input.action_details || '').trim(),
  };

  if (!fs.existsSync(AUDIT_DATA_DIR)) {
    fs.mkdirSync(AUDIT_DATA_DIR, { recursive: true });
  }
  fs.appendFileSync(AUDIT_LOG_FILE, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  return record;
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const ROUTER_SYSTEM_PROMPT = `You are the Lead Triage, SLA Routing, and Quotation Intelligence Assistant for T.J. Wang's Finance Department.
Analyze incoming client emails across 6 primary Malaysian corporate service lines:
- Co Sec: New Sdn Bhd/LLP incorporation, annual compliance maintenance, AGM/board resolutions, share transfers, strike-off, CTC documents.
- Accounting: Monthly/quarterly bookkeeping, SST-02 return filing, financial statement compilation, management accounts.
- Audit: Annual statutory financial audit, independent compliance review.
- Tax: Corporate tax (Form C), CP204 tax estimates/revisions, employer returns (Form E), personal income tax (Form B/BE).
- Payroll: Monthly payroll computation, payslips, EPF, SOCSO, EIS, PCB (MTD) statutory filings, and annual Form EA preparation.
- Finance: Financial planning & analysis (FP&A), cash flow forecasting, budgeting, working capital advisory, financial modeling, management consulting, and bank loan/credit facilities documentation support.

Extract client contact details accurately. If phone or company name is missing, infer conservatively from email signature/domain or return "Prospective Client" / empty string for phone.
Flag that the assigned PIC must contact the lead within 4 working days.
Always return structured JSON adhering strictly to the provided schema.`;

const QUOTATION_SYSTEM_PROMPT = `You are the Lead Triage, SLA Routing, and Quotation Intelligence Assistant for T.J. Wang's Finance Department.
Using confirmed PIC discovery scope notes, entity profile, and required service lines, generate realistic, professional Malaysian SME quotation line items in Ringgit Malaysia (MYR):
- Co Sec Retainer: RM 60 - RM 120 / month (billed Monthly).
- Sdn Bhd Incorporation: RM 1,500 - RM 2,500 (One-off setup fee, including SSM statutory fees).
- Monthly Accounting: RM 300 - RM 1,500 / month based on monthly transaction volume, revenue tier, and SST status (plus backlog catch-up One-off fee if applicable).
- Payroll Processing: RM 30 - RM 50 / employee / month (set quantity = headcount, unitPriceMyr between 30 and 50, frequency = Monthly).
- Corporate Tax (Form C / CP204): RM 1,200 - RM 3,500 / year (billed Annual).
- Statutory Audit: RM 2,500 - RM 8,000+ / year scaled by revenue and complexity (billed Annual).
- Finance Advisory / Cash Flow / FP&A: RM 800 - RM 3,000 / month (retainer, billed Monthly) or RM 2,000 - RM 5,000 (one-off project basis, billed One-off).

Provide clear, practical deliverables for each line item, plus concise Malaysian corporate legal remarks (validity 7 calendar days, SST 8% service tax note where applicable, payment terms 50% deposit upon acceptance, and notice that final proposal dispatch is subject to management review), realistic scoping assumptions, and explicit out-of-scope exclusions.
Output exact JSON matching the schema.`;

const UNIFIED_ASSISTANT_SYSTEM_PROMPT = `You are the Lead Triage, SLA Routing, Quotation Intelligence, and Compliance Audit Engine for T.J. Wang's Finance Department.

### OPERATIONAL CONTEXT & SERVICES
You handle inbound client inquiries, quotation generation, and operational compliance tracking across 6 corporate service lines:
1. Company Secretarial (Co Sec): Incorporation, annual returns, AGM/board resolutions, share transfers, strike-off, CTC docs.
2. Accounting & Bookkeeping (Accounting): Monthly/quarterly bookkeeping, SST-02 return filing, financial statement compilation, management accounts.
3. Statutory Audit (Audit): Annual statutory financial audit, independent compliance review.
4. Corporate & Personal Tax (Tax): Corporate tax (Form C), CP204 estimates/revisions, employer returns (Form E), personal tax (Form B/BE).
5. Payroll (Payroll): Monthly payroll computation, payslips, EPF, SOCSO, EIS, PCB (MTD) statutory filings, annual Form EA.
6. Finance (Finance): Financial planning & analysis (FP&A), cash flow forecasting, budgeting, working capital advisory, financial modeling, management consulting, and bank facility documentation.

### WORKFLOW RESPONSIBILITIES
- Automatically detect whether the user's input is an initial client inquiry/email/intake note ("LEAD_TRIAGE"), confirmed PIC scope/discovery notes requesting fee estimation ("QUOTATION_GENERATION"), or an operational compliance/audit event ("AUDIT_LOG_EVENT").
- For LEAD_TRIAGE (Task 1):
  * Extract prospect details into lead_profile (company_name, contact_person, contact_phone, contact_email, entity_type: Sdn Bhd | Enterprise | LLP | Unknown).
  * Assign primary_dept and any secondary_depts from: Co Sec, Accounting, Audit, Tax, Payroll, Finance.
  * Set sla_days_limit = 4 and provide a concise 2-sentence routing_reason summarizing the prospect's background, core requirement, and noting that the assigned PIC must contact the lead within 4 working days.
  * Return an empty quotation.line_items array with 0.00 totals and default validity_days = 7.
  * Draft a polite, professional initial acknowledgement client_reply_draft.
- For QUOTATION_GENERATION (Task 2):
  * Parse annual revenue/turnover tier, monthly transaction volume, employee headcount, advisory scope, and compliance deadlines.
  * Generate realistic, professional Malaysian SME quotation line items in Ringgit Malaysia (MYR):
    - Co Sec Retainer: ~RM 60 – RM 120 / month (Monthly)
    - Sdn Bhd Incorporation: ~RM 1,500 – RM 2,500 (One-off)
    - Monthly Accounting: ~RM 300 – RM 1,500 / month (Monthly, tiered by volume/SST)
    - Payroll Processing: ~RM 30 – RM 50 / employee / month (Monthly; multiply by headcount for total monthly rate_myr and note employee count in scope_summary)
    - Corporate Tax (Form C): ~RM 1,200 – RM 3,500 / year (Annually)
    - Statutory Audit: ~RM 2,500 – RM 8,000+ / year (Annually)
    - Finance Advisory / Cash Flow / FP&A: ~RM 800 – RM 3,000 / month (Monthly retainer) or ~RM 2,000 – RM 5,000 (One-off project basis)
  * Compute exact fee subtotals: total_setup_fee_myr (sum of One-off items), total_monthly_recurring_myr (sum of Monthly items), and total_annual_recurring_myr (sum of Annually items).
  * Default Quotation Validity (FIXED): Set validity_days = 7 and valid_until = exact YYYY-MM-DD date 7 calendar days from today's date (provided in prompt context).
  * Generate a formal client_reply_draft from T.J. Wang's Finance Department summarizing the proposed scope and 7-day validity terms, explicitly confirming that final proposal dispatch is subject to management review.
- ALWAYS populate audit_event accurately reflecting the user session context and the action_taken (e.g., TRIAGE_INBOUND_LEAD, EDIT_LEAD_TRIAGE, EDIT_CONTACT_STATUS, GENERATE_QUOTATION, EDIT_QUOTATION_DRAFT, SESSION_TIMEOUT_IDLE, VIEW_PAGE, etc.) with Asia/Kuala_Lumpur ISO 8601 timestamp (+08:00).

### ROLE-BASED ACCESS & IMMUTABLE AUDIT CONSTRAINTS
- STRICTLY NO SAMPLE DATA & NO FAKE USERS: Never fabricate unrelated mock records or fake user accounts; only process the provided input.
- THREE-TIER ROLE ACCESS CONTROL & DEPARTMENT CONSTRAINTS:
  * Non-Finance departments (Co Sec, Accounting, Audit, Tax, Payroll) are strictly locked to 'user' role only.
  * Finance Department is authorized for 'administrator', 'executive', or 'user' roles.
  * 'administrator' (Finance only): Full operational access, Step 6 quotation drafting, exclusive Step 7 approval & validity amendment, and exclusive CSV/JSON audit trail export.
  * 'executive' (Finance only): Full operational access and Step 6 quotation drafting/editing; cannot approve quotations, amend validity, or export audit logs.
  * 'user': Operational Steps 1–4 intake, SLA contact tracking, and scope logging only; cannot draft quotations, approve quotations, or export audit logs.
- IMMUTABLE APPEND-ONLY AUDIT TRAIL: Nobody, including Administrators, can delete, purge, alter, or truncate audit log records.
- DANGER ZONE & 2FA GOVERNANCE:
  * Danger Zone actions (2FA_OVERRIDE, ARCHIVE_LEAD, VOID_QUOTATION) are exclusively permitted for Finance Department 'administrator' role.
  * Staff 2FA status, recovery keys, or authenticator bindings MUST NEVER be changed, reset, bypassed, or disabled unless explicitly approved and performed by a Finance 'administrator'.
  * If a 'user' or 'executive' requests a Danger Zone / 2FA override action, return mode = "DANGER_ZONE_ACTION" with danger_zone_event.status = "REJECTED" and approved_by_admin = "".
- SECURITY SESSION TIMEOUT: Active staff sessions automatically terminate after 10 continuous minutes (600,000 ms) of inactivity, clearing tjw_session and recording SESSION_TIMEOUT_IDLE.

Always return strictly valid JSON matching the provided schema.`;

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: formatKualaLumpurIso() });
  });

  // =========================================================================
  // IMMUTABLE APPEND-ONLY AUDIT TRAIL ENDPOINTS (NO DELETE / PUT / PATCH)
  // =========================================================================
  app.get('/api/audit-logs', (_req, res) => {
    res.json({ logs: readImmutableAuditLogs() });
  });

  app.post('/api/audit-logs', (req, res) => {
    try {
      const body = req.body as Partial<ImmutableAuditRecord>;
      if (!body || !body.user_name || !body.action_taken) {
        res.status(400).json({ error: 'user_name and action_taken are required to append an audit log.' });
        return;
      }
      const created = appendImmutableAuditLog(body);
      res.status(201).json({ log: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to append audit log.';
      res.status(500).json({ error: message });
    }
  });

  // Strict No-Deletion / No-Mutation Rule: Reject DELETE, PUT, PATCH with HTTP 403 Forbidden
  const rejectAuditMutation = (_req: express.Request, res: express.Response) => {
    res.status(403).json({
      error:
        'HTTP 403 Forbidden: The T.J. Wang Finance Department audit trail is strictly append-only. Deleting, altering, or truncating audit records is prohibited for all roles including Administrators.',
    });
  };
  app.delete('/api/audit-logs', rejectAuditMutation);
  app.delete('/api/audit-logs/:id', rejectAuditMutation);
  app.put('/api/audit-logs', rejectAuditMutation);
  app.put('/api/audit-logs/:id', rejectAuditMutation);
  app.patch('/api/audit-logs', rejectAuditMutation);
  app.patch('/api/audit-logs/:id', rejectAuditMutation);

  // Finance Administrator-Exclusive Audit Trail Export Endpoint (CSV or JSON)
  app.get('/api/audit-logs/export', (req, res) => {
    const roleHeader = String(req.header('x-user-role') || req.query.role || '')
      .trim()
      .toLowerCase();
    const deptHeader = String(req.header('x-user-department') || 'Finance').trim();

    if (roleHeader !== 'administrator' || deptHeader !== 'Finance') {
      res.status(403).json({
        error:
          'Export restricted to Finance Department Administrator (role === "administrator" and department === "Finance" required).',
      });
      return;
    }

    const format = String(req.query.format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
    const userName = String(req.header('x-user-name') || 'Administrator').trim();
    const userEmail = String(req.header('x-user-email') || '').trim();
    const department = deptHeader;

    // Append immutable EXPORT_AUDIT_LOG event before streaming file data
    const exportEvent = appendImmutableAuditLog({
      user_name: userName,
      user_email: userEmail,
      user_role: 'administrator',
      department: VALID_DEPARTMENTS.has(department)
        ? (department as ImmutableAuditRecord['department'])
        : 'Finance',
      page_visited: 'Audit Trail View',
      action_taken: 'EXPORT_AUDIT_LOG',
      target_id: `AUDIT-${format.toUpperCase()}`,
      action_details: `Administrator ${userName} exported immutable audit trail in ${format.toUpperCase()} format.`,
    });

    const logs = readImmutableAuditLogs();
    const dateStamp = formatKualaLumpurCompactDate();
    res.setHeader('x-export-log-id', exportEvent.log_id);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="tjw_audit_trail_${dateStamp}.json"`
      );
      res.send(JSON.stringify(logs, null, 2));
      return;
    }

    const headers = [
      'log_id',
      'timestamp',
      'user_name',
      'user_email',
      'user_role',
      'department',
      'page_visited',
      'action_taken',
      'target_id',
      'action_details',
    ];
    const rows = logs.map((row) =>
      [
        row.log_id,
        row.timestamp,
        row.user_name,
        row.user_email,
        row.user_role,
        row.department,
        row.page_visited,
        row.action_taken,
        row.target_id,
        row.action_details,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tjw_audit_trail_${dateStamp}.csv"`
    );
    res.send(csvContent);
  });

  // Step 1: Inbound Email Extraction & AI Triage Router
  app.post('/api/ai/triage', async (req, res) => {
    try {
      const { emailSubject, rawEmailBody } = req.body as {
        emailSubject?: string;
        rawEmailBody?: string;
      };

      if (!rawEmailBody || typeof rawEmailBody !== 'string' || rawEmailBody.trim().length < 10) {
        res.status(400).json({ error: 'Please provide a valid inbound email body (at least 10 characters).' });
        return;
      }

      const ai = createGeminiClient();
      const prompt = `Email Subject: ${emailSubject || '(No Subject)'}\n\nEmail Body:\n${rawEmailBody.slice(0, 9500)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction: ROUTER_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                company_name: {
                  type: Type.STRING,
                  description: 'Prospect company name (e.g. Acme Holdings Sdn Bhd). If sole prop or individual, use their name or Prospective Entity.',
                },
                contact_person: {
                  type: Type.STRING,
                  description: 'Full name of the prospect contact person.',
                },
                contact_email: {
                  type: Type.STRING,
                  description: 'Email address of the prospect, or empty string if absent.',
                },
                contact_phone: {
                  type: Type.STRING,
                  description: 'Malaysian or international phone/WhatsApp number, or empty string if absent.',
                },
                service_lines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                    enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                  },
                  description: 'All applicable service departments identified in the inquiry.',
                },
                primary_department: {
                  type: Type.STRING,
                  enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                  description: 'Primary lead-owning department PIC to route this inquiry to.',
                },
                inquiry_summary: {
                  type: Type.STRING,
                  description: 'Concise 2-sentence executive summary of the client inquiry and compliance needs.',
                },
                inferred_entity_type: {
                  type: Type.STRING,
                  enum: ['', 'Sdn Bhd', 'Enterprise', 'LLP', 'Unknown', 'Sole Prop', 'Bhd'],
                  description: 'Detected Malaysian entity type if mentioned, otherwise Unknown or empty string.',
                },
              },
              required: [
                'company_name',
                'contact_person',
                'contact_email',
                'contact_phone',
                'service_lines',
                'primary_department',
                'inquiry_summary',
                'inferred_entity_type',
              ],
            },
          },
        })
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI Triage returned an empty response. Please try again.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({ triage: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze inbound email.';
      console.error('[/api/ai/triage] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Step 6: AI-Assisted Malaysian Corporate Advisory Quotation Engine
  app.post('/api/ai/generate-quotation', async (req, res) => {
    try {
      const {
        companyName,
        entityType,
        annualTurnoverMyr,
        monthlyBankTxCount,
        headcount,
        accountingState,
        sstRegistered,
        serviceLines,
        scopeNotes,
        inquirySummary,
      } = req.body as {
        companyName?: string;
        entityType?: string;
        annualTurnoverMyr?: number;
        monthlyBankTxCount?: number;
        headcount?: number;
        accountingState?: string;
        sstRegistered?: boolean;
        serviceLines?: string[];
        scopeNotes?: string;
        inquirySummary?: string;
      };

      if (!companyName || !Array.isArray(serviceLines) || serviceLines.length === 0) {
        res.status(400).json({ error: 'Company name and at least one service line are required.' });
        return;
      }

      const ai = createGeminiClient();
      const prompt = `Generate a structured Malaysian corporate advisory quotation for:
Company Name: ${companyName}
Entity Type: ${entityType || 'Sdn Bhd'}
Estimated Annual Turnover: RM ${Number(annualTurnoverMyr || 0).toLocaleString('en-MY')}
Monthly Bank Transactions: ${Number(monthlyBankTxCount || 0)}
Total Headcount (Payroll): ${Number(headcount || 0)}
Current Accounting State: ${accountingState || 'Up-to-date'}
SST Registered: ${sstRegistered ? 'Yes' : 'No'}
Required Service Lines: ${serviceLines.join(', ')}
Initial Inquiry Summary: ${inquirySummary || 'N/A'}
PIC Verified Discovery Scope Notes: ${scopeNotes || 'Standard annual statutory compliance and advisory package.'}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction: QUOTATION_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                line_items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      serviceCategory: {
                        type: Type.STRING,
                        enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                      },
                      description: {
                        type: Type.STRING,
                        description: 'Clear commercial line item title and scope description.',
                      },
                      deliverables: {
                        type: Type.STRING,
                        description: 'Specific statutory filings, reports, or deliverables included.',
                      },
                      frequency: {
                        type: Type.STRING,
                        enum: ['One-off', 'Monthly', 'Annual'],
                      },
                      quantity: {
                        type: Type.INTEGER,
                        description: 'Quantity (e.g., 1 for retainer/filing, or employee count for payroll).',
                      },
                      unitPriceMyr: {
                        type: Type.NUMBER,
                        description: 'Unit fee in Malaysian Ringgit (MYR) matching benchmarks.',
                      },
                    },
                    required: [
                      'serviceCategory',
                      'description',
                      'deliverables',
                      'frequency',
                      'quantity',
                      'unitPriceMyr',
                    ],
                  },
                },
                legal_remarks: {
                  type: Type.STRING,
                  description: 'Standard engagement terms, validity period (30 days), payment schedule, and 8% SST applicability note.',
                },
                assumptions: {
                  type: Type.STRING,
                  description: 'Key operational assumptions (timely source document submission, bank feed access, transaction tier caps).',
                },
                exclusions: {
                  type: Type.STRING,
                  description: 'Out-of-scope exclusions (government disbursements, SSM penalty fines, LHDN tax audit defense, courier charges).',
                },
              },
              required: ['line_items', 'legal_remarks', 'assumptions', 'exclusions'],
            },
          },
        })
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI Quotation Engine returned an empty response. Please try again.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({ quotation: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate quotation.';
      console.error('[/api/ai/generate-quotation] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Unified AI Intelligence & Compliance Audit Assistant
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const { input, sessionContext } = req.body as {
        input?: string;
        sessionContext?: {
          user_name?: string;
          user_email?: string;
          user_role?: 'administrator' | 'executive' | 'user';
          department?: string;
          page_visited?: string;
        };
      };
      if (!input || typeof input !== 'string' || input.trim().length < 10) {
        res.status(400).json({
          error: 'Please enter a client inquiry email, intake note, or confirmed PIC scope (at least 10 characters).',
        });
        return;
      }

      const today = new Date();
      const formatYmd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const todayYmd = formatYmd(today);
      const defaultValidUntilYmd = formatYmd(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
      );
      const klTimestamp = formatKualaLumpurIso(today);
      const nextLogId = `LOG-${formatKualaLumpurCompactDate(today)}-${String(
        readImmutableAuditLogs().length + 1
      ).padStart(3, '0')}`;

      const ctxName = sessionContext?.user_name || 'Staff Member';
      const ctxEmail = sessionContext?.user_email || '';
      const ctxDept = VALID_DEPARTMENTS.has(String(sessionContext?.department || ''))
        ? (sessionContext!.department as ImmutableAuditRecord['department'])
        : 'Finance';
      const rawCtxRole = String(sessionContext?.user_role || '').toLowerCase();
      const ctxRole: ImmutableAuditRecord['user_role'] =
        ctxDept !== 'Finance'
          ? 'user'
          : rawCtxRole === 'administrator'
            ? 'administrator'
            : rawCtxRole === 'executive'
              ? 'executive'
              : 'user';
      const ctxPage = sessionContext?.page_visited || 'AI Intelligence Assistant';

      const ai = createGeminiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Current Date: ${todayYmd}
Current Kuala Lumpur Timestamp (UTC+8): ${klTimestamp}
Fixed Default 7-Day Valid Until Date: ${defaultValidUntilYmd}
Assigned Audit Log ID: ${nextLogId}
Active Session Context: user_name="${ctxName}", user_email="${ctxEmail}", user_role="${ctxRole}", department="${ctxDept}", page_visited="${ctxPage}"

Input:
${input.slice(0, 9500)}`,
          config: {
            systemInstruction: UNIFIED_ASSISTANT_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                mode: {
                  type: Type.STRING,
                  enum: [
                    'LEAD_TRIAGE',
                    'QUOTATION_GENERATION',
                    'AUDIT_LOG_EVENT',
                    'DANGER_ZONE_ACTION',
                  ],
                },
                lead_profile: {
                  type: Type.OBJECT,
                  properties: {
                    company_name: { type: Type.STRING },
                    contact_person: { type: Type.STRING },
                    contact_phone: { type: Type.STRING },
                    contact_email: { type: Type.STRING },
                    entity_type: {
                      type: Type.STRING,
                      enum: ['Sdn Bhd', 'Enterprise', 'LLP', 'Unknown'],
                    },
                  },
                  required: [
                    'company_name',
                    'contact_person',
                    'contact_phone',
                    'contact_email',
                    'entity_type',
                  ],
                },
                routing: {
                  type: Type.OBJECT,
                  properties: {
                    primary_dept: {
                      type: Type.STRING,
                      enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                    },
                    secondary_depts: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.STRING,
                        enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                      },
                    },
                    sla_days_limit: { type: Type.INTEGER },
                    routing_reason: { type: Type.STRING },
                  },
                  required: [
                    'primary_dept',
                    'secondary_depts',
                    'sla_days_limit',
                    'routing_reason',
                  ],
                },
                quotation: {
                  type: Type.OBJECT,
                  properties: {
                    validity_days: { type: Type.INTEGER },
                    valid_until: { type: Type.STRING },
                    line_items: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          dept: {
                            type: Type.STRING,
                            enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                          },
                          service_title: { type: Type.STRING },
                          scope_summary: { type: Type.STRING },
                          billing_cycle: {
                            type: Type.STRING,
                            enum: ['One-off', 'Monthly', 'Annually'],
                          },
                          rate_myr: { type: Type.NUMBER },
                        },
                        required: [
                          'dept',
                          'service_title',
                          'scope_summary',
                          'billing_cycle',
                          'rate_myr',
                        ],
                      },
                    },
                    total_setup_fee_myr: { type: Type.NUMBER },
                    total_monthly_recurring_myr: { type: Type.NUMBER },
                    total_annual_recurring_myr: { type: Type.NUMBER },
                  },
                  required: [
                    'validity_days',
                    'valid_until',
                    'line_items',
                    'total_setup_fee_myr',
                    'total_monthly_recurring_myr',
                    'total_annual_recurring_myr',
                  ],
                },
                danger_zone_event: {
                  type: Type.OBJECT,
                  properties: {
                    action_type: {
                      type: Type.STRING,
                      enum: ['2FA_OVERRIDE', 'ARCHIVE_LEAD', 'VOID_QUOTATION'],
                    },
                    target_user_email: { type: Type.STRING },
                    approved_by_admin: { type: Type.STRING },
                    status: {
                      type: Type.STRING,
                      enum: ['APPROVED', 'REJECTED'],
                    },
                    details: { type: Type.STRING },
                  },
                  required: [
                    'action_type',
                    'target_user_email',
                    'approved_by_admin',
                    'status',
                    'details',
                  ],
                },
                audit_event: {
                  type: Type.OBJECT,
                  properties: {
                    log_id: { type: Type.STRING },
                    timestamp: { type: Type.STRING },
                    user_name: { type: Type.STRING },
                    user_email: { type: Type.STRING },
                    user_role: {
                      type: Type.STRING,
                      enum: ['administrator', 'executive', 'user'],
                    },
                    department: {
                      type: Type.STRING,
                      enum: ['Co Sec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Finance'],
                    },
                    page_visited: { type: Type.STRING },
                    action_taken: { type: Type.STRING },
                    target_id: { type: Type.STRING },
                    action_details: { type: Type.STRING },
                  },
                  required: [
                    'log_id',
                    'timestamp',
                    'user_name',
                    'user_email',
                    'user_role',
                    'department',
                    'page_visited',
                    'action_taken',
                    'target_id',
                    'action_details',
                  ],
                },
                client_reply_draft: { type: Type.STRING },
              },
              required: [
                'mode',
                'lead_profile',
                'routing',
                'quotation',
                'danger_zone_event',
                'audit_event',
                'client_reply_draft',
              ],
            },
          },
        })
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI Intelligence Assistant returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        mode?: string;
        routing?: { sla_days_limit?: number };
        quotation?: {
          validity_days?: number;
          valid_until?: string;
          line_items?: Array<{ billing_cycle?: string; rate_myr?: number }>;
          total_setup_fee_myr?: number;
          total_monthly_recurring_myr?: number;
          total_annual_recurring_myr?: number;
        };
        danger_zone_event?: {
          action_type?: '2FA_OVERRIDE' | 'ARCHIVE_LEAD' | 'VOID_QUOTATION';
          target_user_email?: string;
          approved_by_admin?: string;
          status?: 'APPROVED' | 'REJECTED';
          details?: string;
        };
        audit_event?: Partial<ImmutableAuditRecord>;
      };

      // Guarantee exact arithmetic subtotals, 4-working-day SLA target, and fixed 7-day default validity
      if (parsed.routing) {
        parsed.routing.sla_days_limit = 4;
      }
      if (parsed.quotation) {
        parsed.quotation.validity_days = 7;
        parsed.quotation.valid_until = defaultValidUntilYmd;

        if (Array.isArray(parsed.quotation.line_items)) {
          let setup = 0;
          let monthly = 0;
          let annual = 0;
          for (const item of parsed.quotation.line_items) {
            const rate = Number(item.rate_myr) || 0;
            if (item.billing_cycle === 'One-off') setup += rate;
            else if (item.billing_cycle === 'Monthly') monthly += rate;
            else if (item.billing_cycle === 'Annually') annual += rate;
          }
          parsed.quotation.total_setup_fee_myr = Math.round(setup * 100) / 100;
          parsed.quotation.total_monthly_recurring_myr = Math.round(monthly * 100) / 100;
          parsed.quotation.total_annual_recurring_myr = Math.round(annual * 100) / 100;
        }
      }

      // Enforce Administrator-only Danger Zone & 2FA approval gate server-side
      if (parsed.mode === 'DANGER_ZONE_ACTION' && parsed.danger_zone_event) {
        if (ctxRole !== 'administrator' || ctxDept !== 'Finance') {
          parsed.danger_zone_event.status = 'REJECTED';
          parsed.danger_zone_event.approved_by_admin = '';
          parsed.danger_zone_event.details =
            'Rejected: Danger Zone and 2FA actions are strictly restricted to Finance Department Administrators.';
        } else if (parsed.danger_zone_event.status === 'APPROVED') {
          parsed.danger_zone_event.approved_by_admin = `${ctxName} (${ctxEmail})`;
        }
      }

      // Normalize & persist immutable audit_event in Asia/Kuala_Lumpur (UTC+8)
      const defaultAction =
        parsed.mode === 'QUOTATION_GENERATION'
          ? 'GENERATE_QUOTATION'
          : parsed.mode === 'LEAD_TRIAGE'
            ? 'TRIAGE_INBOUND_LEAD'
            : parsed.mode === 'DANGER_ZONE_ACTION'
              ? 'DANGER_ZONE_2FA_OVERRIDE'
              : 'VIEW_PAGE';

      const persistedEvent = appendImmutableAuditLog({
        log_id: nextLogId,
        timestamp: klTimestamp,
        user_name: ctxName,
        user_email: ctxEmail,
        user_role: ctxRole,
        department: ctxDept,
        page_visited: ctxPage,
        action_taken: parsed.audit_event?.action_taken || defaultAction,
        target_id: parsed.audit_event?.target_id || '—',
        action_details:
          parsed.audit_event?.action_details ||
          `Executed Intelligence Assistant (${parsed.mode || 'LEAD_TRIAGE'}).`,
      });
      parsed.audit_event = persistedEvent;

      res.json({ result: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process AI assistant request.';
      console.error('[/api/ai/assistant] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`T.J. Wang Finance Operations server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
