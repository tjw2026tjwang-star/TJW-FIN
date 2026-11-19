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

const ROUTER_SYSTEM_PROMPT = `You are a corporate secretarial, tax, and accounting operations triage specialist for a Malaysian corporate advisory firm.
Analyze incoming client emails and determine the required service departments:
- CoSec: Incorporation (Sdn Bhd / LLP), AGM, Board Resolutions, SSM Filing, Share Allotment, Company Secretary Retainer.
- Accounting: Bookkeeping, Monthly/Annual Financial Statements, SST-02, Management Accounts, Backlog Accounting.
- Audit: Statutory Year-End Audit, Audit Exemption Review, Special Purpose Audit.
- Tax: Corporate Form C, Tax Planning, CP204 Estimation, Form E, Personal Tax, Transfer Pricing.
- Payroll: Monthly Salary, EPF/SOCSO/EIS, PCB, Form EA, HRDF.

Extract client contact details accurately. If phone or company name is missing, infer conservatively from email signature/domain or return "Prospective Client" / empty string for phone.
Always return structured JSON adhering strictly to the provided schema.`;

const QUOTATION_SYSTEM_PROMPT = `You are an expert Finance Pricing Specialist for Malaysian Corporate Services.
Using the PIC discovery scope notes, entity profile, and required service lines, generate transparent quotation line items in Malaysian Ringgit (MYR) adhering strictly to these standard Malaysian corporate advisory benchmarks:
- Co Sec Retainer: RM 60 - RM 120 / month (billed Monthly).
- Sdn Bhd Incorporation: RM 1,500 - RM 2,500 (One-off setup fee, including SSM statutory fees).
- Monthly Bookkeeping: RM 300 - RM 1,500 / month based on monthly bank transaction volume and annual revenue tier (plus backlog catch-up One-off fee if accounting state indicates backlog).
- Statutory Audit: Minimum RM 2,500+ baseline scaled by revenue and complexity (billed Annual).
- Tax Submission (Form C / CP204): RM 1,200 - RM 3,500 / year (billed Annual).
- Payroll Services: RM 30 - RM 50 / employee / month (set quantity = headcount, unitPriceMyr between 30 and 50, frequency = Monthly).
- SST-02 Bi-Monthly Return Filing (if SST registered): RM 250 - RM 450 / filing or RM 150 - RM 250 / month.

Provide clear, practical deliverables for each line item, plus concise Malaysian corporate legal remarks (validity 30 days, SST 8% service tax note where applicable, payment terms 50% deposit upon acceptance), realistic scoping assumptions, and explicit out-of-scope exclusions.
Output exact JSON matching the schema.`;

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
                    enum: ['CoSec', 'Accounting', 'Audit', 'Tax', 'Payroll'],
                  },
                  description: 'All applicable service departments identified in the inquiry.',
                },
                primary_department: {
                  type: Type.STRING,
                  enum: ['CoSec', 'Accounting', 'Audit', 'Tax', 'Payroll'],
                  description: 'Primary lead-owning department PIC to route this inquiry to.',
                },
                inquiry_summary: {
                  type: Type.STRING,
                  description: 'Concise 2-3 sentence executive summary of the client inquiry and compliance needs.',
                },
                inferred_entity_type: {
                  type: Type.STRING,
                  enum: ['', 'Sdn Bhd', 'Sole Prop', 'LLP', 'Partnership', 'Bhd', 'Labuan'],
                  description: 'Detected Malaysian entity type if mentioned, otherwise empty string.',
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
                        enum: ['CoSec', 'Accounting', 'Audit', 'Tax', 'Payroll', 'Advisory'],
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
    console.log(`Meridian Advisory Ops server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
