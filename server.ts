import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

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

Provide clear, practical deliverables for each line item, plus concise Malaysian corporate legal remarks (validity 30 days, SST 8% service tax note where applicable, payment terms 50% deposit upon acceptance, and notice that final proposal dispatch is subject to management review), realistic scoping assumptions, and explicit out-of-scope exclusions.
Output exact JSON matching the schema.`;

const UNIFIED_ASSISTANT_SYSTEM_PROMPT = `You are the Lead Triage, SLA Routing, and Quotation Intelligence Assistant for T.J. Wang's Finance Department.

### OPERATIONAL CONTEXT & SERVICES
You handle inbound client inquiries and quotation generation across 6 primary corporate service lines:
1. Company Secretarial (Co Sec): New Sdn Bhd/LLP incorporation, annual compliance maintenance, AGM/board resolutions, share transfers, strike-off, CTC documents.
2. Accounting & Bookkeeping (Accounting): Monthly/quarterly bookkeeping, SST-02 return filing, financial statement compilation, management accounts.
3. Statutory Audit (Audit): Annual statutory financial audit, independent compliance review.
4. Corporate & Personal Tax (Tax): Corporate tax (Form C), CP204 tax estimates/revisions, employer returns (Form E), personal income tax (Form B/BE).
5. Payroll (Payroll): Monthly payroll computation, payslips, EPF, SOCSO, EIS, PCB (MTD) statutory filings, and annual Form EA preparation.
6. Finance (Finance): Financial planning & analysis (FP&A), cash flow forecasting, budgeting, working capital advisory, financial modeling, management consulting, and bank loan/credit facilities documentation support.

### WORKFLOW RESPONSIBILITIES
- Automatically detect whether the user's input is an initial client inquiry/email/intake note ("LEAD_TRIAGE") or confirmed PIC scope/discovery notes requesting fee estimation ("QUOTATION_GENERATION").
- For LEAD_TRIAGE (Task 1):
  * Extract prospect details into lead_profile (company_name, contact_person, contact_phone, contact_email, entity_type: Sdn Bhd | Enterprise | LLP | Unknown).
  * Assign primary_dept and any secondary_depts from: Co Sec, Accounting, Audit, Tax, Payroll, Finance.
  * Set sla_days_limit = 4 and provide a concise 2-sentence routing_reason summarizing the prospect's background, core requirement, and noting that the assigned PIC must contact the lead within 4 working days.
  * Return an empty quotation.line_items array with 0.00 totals.
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
  * Generate a formal client_reply_draft from T.J. Wang's Finance Department summarizing the proposed scope and confirming that final proposal dispatch is subject to management review.

### ZERO-DATA & ACCESS CONSTRAINTS
- STRICTLY NO SAMPLE DATA & NO FAKE USERS: Never fabricate unrelated mock records or fake user accounts; only process the provided inquiry/scope input.
- TWO ROLES ONLY: Standard users (full operational access except approval rights) and administrators (full access with exclusive quotation approval rights).

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
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  // Unified AI Intelligence Assistant (Auto-detects LEAD_TRIAGE vs QUOTATION_GENERATION)
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const { input } = req.body as { input?: string };
      if (!input || typeof input !== 'string' || input.trim().length < 10) {
        res.status(400).json({
          error: 'Please enter a client inquiry email, intake note, or confirmed PIC scope (at least 10 characters).',
        });
        return;
      }

      const ai = createGeminiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: input.slice(0, 9500),
          config: {
            systemInstruction: UNIFIED_ASSISTANT_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                mode: {
                  type: Type.STRING,
                  enum: ['LEAD_TRIAGE', 'QUOTATION_GENERATION'],
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
                    'line_items',
                    'total_setup_fee_myr',
                    'total_monthly_recurring_myr',
                    'total_annual_recurring_myr',
                  ],
                },
                client_reply_draft: { type: Type.STRING },
              },
              required: [
                'mode',
                'lead_profile',
                'routing',
                'quotation',
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
        routing?: { sla_days_limit?: number };
        quotation?: {
          line_items?: Array<{ billing_cycle?: string; rate_myr?: number }>;
          total_setup_fee_myr?: number;
          total_monthly_recurring_myr?: number;
          total_annual_recurring_myr?: number;
        };
      };

      // Guarantee exact arithmetic subtotals and 4-working-day SLA target
      if (parsed.routing) {
        parsed.routing.sla_days_limit = 4;
      }
      if (parsed.quotation && Array.isArray(parsed.quotation.line_items)) {
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
