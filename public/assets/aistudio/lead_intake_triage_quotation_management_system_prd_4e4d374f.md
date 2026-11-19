# Product Requirement Document (PRD)
## Project: Corporate Advisory & Finance Operations Lead Triage & Quotation Engine

---

## 1. Document Control & Metadata

| Field | Detail |
| :--- | :--- |
| **Document Version** | 1.0.0 |
| **Status** | Approved for Development |
| **Owner** | Finance & Corporate Advisory Department |
| **Author** | Enterprise AI Solutions Architect |
| **Target Audience** | Engineering, Finance Leadership, Department PICs (Co Sec, Acc, Aud, Tax, Payroll) |

---

## 2. Executive Summary & Problem Statement

### 2.1 Problem Statement
The Finance and Corporate Advisory department handles prospective client inquiries across five major service verticals: **Company Secretarial (Co Sec)**, **Accounting (Acc)**, **Statutory Audit (Aud)**, **Corporate/Personal Tax (Tax)**, and **Payroll Processing**. Currently, lead processing is handled manually via ad-hoc emails, resulting in:
- Delayed response times and unclear departmental ownership.
- Lack of accountability regarding whether prospects are contacted within the defined Service Level Agreement (SLA) of 4 working days.
- Inconsistent fee estimation, unstandardized quotation scopes, and risk of unauthorized proposals sent without senior finance approval.

### 2.2 Objective & Solution Vision
Build an AI-augmented, event-driven intake and quotation management platform that:
1. Ingests raw email inquiries and automatically parses & routes them to designated departmental PICs.
2. Tracks outreach SLA status and triggers automated alerts if prospects remain uncontacted beyond 4 working days.
3. Accepts verified client scopes from PICs and utilizes Google AI Studio (Gemini) to generate structured quotation line items according to Malaysian corporate advisory fee baselines.
4. Enforces strict approval gates requiring authorized finance leadership sign-off before dispatching proposals.

---

## 3. High-Level 8-Step Workflow Architecture

```
[ Step 1: Raw Inbound Lead (Email) ]
                 │
                 ▼
[ Gemini Extraction & Triage Engine ] ──► Auto-Assign Department PIC
                 │
                 ▼
[ Step 2 & 3: PIC Outreach & SLA Tracking ]
       │                                │
 (Contacted ≤ 4 Days)           (Uncontacted > 4 Days)
       │                                │
       ▼                                ▼
[ Step 4: Record Scope ]        [ Step 5: Escalation Alerts ]
       │
       ▼
[ Step 6: AI Quotation Generator ]
       │
       ▼
[ Step 7: Finance Approval Queue ]
       │
  (Approval = TRUE)
       │
       ▼
[ Step 8: PDF / Email / WhatsApp Proposal Dispatch ]
```

---

## 4. User Personas & Roles

| Role | Persona | Responsibilities |
| :--- | :--- | :--- |
| **Lead / Prospect** | Prospective Client / SME Director | Submits initial inquiry regarding compliance and advisory services. |
| **Department PIC** | In-charge of Co Sec, Acc, Aud, Tax, or Payroll | Outreach to prospect, consult on exact scope, submit scope specifications. |
| **Finance Approver** | Finance Director / Partner | Reviews quote parameters, pricing, margin, and ticks approval gate. |
| **System Administrator** | IT / Ops Admin | Manages user assignment lists, public holiday calendars, and SLA thresholds. |

---

## 5. Functional Specifications by Step

### Step 1: Lead Ingestion & AI Routing
* **Input:** Raw inbound email via IMAP/Gmail API webhook.
* **Functional Requirements:**
  * System triggers Gemini 2.5 Flash with structured output schema to extract:
    * `company_name`, `contact_person`, `contact_email`, `contact_phone`.
    * Identified service lines: `Co Sec`, `Accounting`, `Audit`, `Tax`, `Payroll`.
    * Executive summary of client inquiry.
  * System creates a record in the database with status `Pending Contact` and logs `received_at` timestamp.
  * System forwards email notification to the corresponding Department PIC(s).

### Step 2: Department PIC Outreach
* **Functional Requirements:**
  * Assigned PIC receives notification with lead details and inquiry summary.
  * PIC conducts outreach via phone call, WhatsApp, or discovery email.

### Step 3: Lead Status & 4-Day SLA Monitoring
* **Functional Requirements:**
  * PIC updates lead status in the CRM portal:
    * Status choices: `Pending Contact`, `Contacted`, `Unreachable / Disqualified`.
    * If `Contacted`, system captures `first_contact_at` timestamp.
  * System evaluates working days elapsed:
    $$\text{Working Days Elapsed} = \text{CountDays}(\text{received\_at}, \text{now()}) - \text{Weekends} - \text{Holidays}$$
  * SLA flag set to:
    * `Compliant` if $\text{Working Days Elapsed} \le 4$ upon contact.
    * `Breached` if $\text{Working Days Elapsed} > 4$ and still uncontacted.

### Step 4: Requirement & Scope Specification
* **Pre-condition:** Lead status is marked as `Contacted`.
* **Functional Requirements:**
  * PIC completes structured scope form including:
    * Entity type (`Sdn Bhd`, `Sole Prop`, `LLP`, etc.).
    * Estimated annual turnover & monthly bank transaction volume.
    * Total headcount (for payroll).
    * Current accounting state (backlog/up-to-date, SST registered).
    * Required services breakdown (e.g., annual retainer, backlog accounting, statutory audit).

### Step 5: Automated Reminder & Escalation Engine
* **Pre-condition:** Lead status remains `Pending Contact`.
* **Functional Requirements:**
  * A scheduled background job runs daily at 09:00 AM (local time).
  * If $\text{Working Days Elapsed} \ge 4$:
    * Sends high-priority reminder email and alert banner to assigned PIC.
    * CCs the Department Head / Finance Manager.
    * Flags the dashboard card with a red visual warning indicator.

### Step 6: AI-Assisted Quotation Generation
* **Functional Requirements:**
  * PIC clicks **"Generate Quotation"**.
  * System feeds Step 4 scope notes to Gemini API with internal fee guidelines.
  * Engine outputs structured quotation:
    * Itemized breakdown with setup fees, recurring fees (monthly/annual), and deliverables.
    * Standard legal remarks, assumptions, and out-of-scope exclusions.
  * System compiles a draft quotation document (PDF and preview record).

### Step 7: Managerial Approval Gating
* **Functional Requirements:**
  * Quotation moves to state: `Pending Approval`.
  * Finance Head / Manager receives review link showing:
    * Client background & PIC discovery notes.
    * Itemized proposed pricing and total contract value.
  * Interface provides a single-action approval checkbox: `is_approved: [X]`.
  * Optional: Rejection button with feedback notes requiring PIC amendment.

### Step 8: Client Proposal Dispatch
* **Pre-condition:** `is_approved == True`.
* **Hard Guardrail:** System blocks any proposal delivery if `is_approved` is `False`.
* **Functional Requirements:**
  * Once ticked, system unlocks the **"Dispatch Quotation"** action.
  * Automatic options:
    1. **Direct Email Dispatch:** Sends standardized quotation email with generated PDF attachment.
    2. **WhatsApp Dispatch:** Generates formatted proposal message and direct `wa.me` sharing link for the PIC.
  * Record transitions to `Quotation Sent` with `dispatched_at` timestamp.

---

## 6. Data Architecture & Entity Relationship

```
+-------------------------------------------------------------+
|                         LEADS                               |
+-------------------------------------------------------------+
| id                       : UUID (PK)                        |
| lead_code                : VARCHAR(30) UNIQUE               |
| raw_email_body           : TEXT                             |
| company_name             : VARCHAR(255)                     |
| contact_person           : VARCHAR(150)                     |
| contact_email            : VARCHAR(150)                     |
| contact_phone            : VARCHAR(50)                      |
| received_at              : TIMESTAMPTZ                      |
| assigned_dept            : ENUM (CoSec, Acc, Aud, Tax, Pay) |
| assigned_pic_id          : UUID (FK -> Users)               |
| contact_status           : ENUM (Pending, Contacted, Dead)  |
| first_contact_at         : TIMESTAMPTZ NULL                 |
| sla_breached             : BOOLEAN DEFAULT FALSE            |
+-------------------------------------------------------------+
                              │ 1
                              ▼ 0..*
+-------------------------------------------------------------+
|                      QUOTATIONS                             |
+-------------------------------------------------------------+
| id                       : UUID (PK)                        |
| lead_id                  : UUID (FK -> Leads.id)            |
| scope_notes              : TEXT                             |
| total_setup_myr          : NUMERIC(10, 2)                   |
| total_recurring_myr      : NUMERIC(10, 2)                   |
| is_approved              : BOOLEAN DEFAULT FALSE            |
| approved_by              : UUID (FK -> Users) NULL          |
| approved_at              : TIMESTAMPTZ NULL                 |
| pdf_document_url         : VARCHAR(500) NULL                |
| dispatch_channel         : ENUM (Email, WhatsApp, Manual)   |
| dispatched_at            : TIMESTAMPTZ NULL                 |
+-------------------------------------------------------------+
                              │ 1
                              ▼ 1..*
+-------------------------------------------------------------+
|                   QUOTATION_LINE_ITEMS                      |
+-------------------------------------------------------------+
| id                       : UUID (PK)                        |
| quotation_id             : UUID (FK -> Quotations.id)       |
| service_category         : VARCHAR(50)                      |
| description              : TEXT                             |
| frequency                : ENUM (One-off, Monthly, Annual)  |
| unit_price_myr           : NUMERIC(10, 2)                   |
+-------------------------------------------------------------+
```

---

## 7. AI Specifications (Google AI Studio / Gemini)

### 7.1 Router System Prompt (Step 1)
```text
You are a corporate secretarial, tax, and accounting operations triage specialist.
Analyze incoming client emails and determine the required service departments:
- Co Sec: Incorporation, AGM, Board Resolutions, SSM Filing, Share Allotment.
- Accounting: Bookkeeping, Monthly/Annual Financial Statements, SST-02.
- Audit: Statutory Year-End Audit, Audit Exemption Review.
- Tax: Corporate Form C, Tax Planning, CP204 Estimation, Form E, Personal Tax.
- Payroll: Monthly Salary, EPF/SOCSO/EIS, PCB, Form EA.

Always return structured JSON adhering to the provided schema.
```

### 7.2 Quotation Engine System Prompt (Step 6)
```text
You are an expert Finance Pricing Specialist for Malaysian Corporate Services.
Using the PIC scope notes, generate transparent quotation line items adhering to these standard benchmarks:
- Co Sec Retainer: RM 60 - RM 120 / month.
- Sdn Bhd Incorporation: RM 1,500 - RM 2,500 (one-time).
- Monthly Bookkeeping: RM 300 - RM 1,500 / month based on transaction volume and revenue tier.
- Statutory Audit: Minimum RM 2,500+ baseline scaled by revenue and asset complexity.
- Tax Submission (Form C): RM 1,200 - RM 3,500 / year.
- Payroll Services: RM 30 - RM 50 / employee / month.

Output exact line-item breakdowns with correct billing frequencies.
```

---

## 8. Non-Functional Requirements

1. **Security & Data Privacy:**
   * Role-Based Access Control (RBAC): PICs can view their assigned leads; only Finance Approvers can modify `is_approved`.
   * Data storage must adhere to applicable personal data protection standards (e.g., PDPA).
2. **Reliability & Availability:**
   * SLA tracking cron job must execute with guaranteed delivery (idempotent executions).
   * 99.5% uptime for the intake webhook.
3. **Audit Trail:**
   * Immutable change log recording who approved the quote and at what exact timestamp.

---

## 9. Success Metrics & KPIs

| Metric | Target Baseline | Target Post-Implementation |
| :--- | :--- | :--- |
| **SLA Adherence Rate** | < 60% within 4 days | ≥ 95% within 4 days |
| **Average Quote Turnaround** | 3 – 5 working days | < 24 hours post-contact |
| **Unapproved Quotes Sent** | Sporadic human error | **0%** (Hardcoded gate enforcement) |
| **PIC Admin Time per Quote** | ~45 minutes | < 5 minutes |

---

## 10. Implementation Phasing & Milestones

* **Phase 1 (Week 1–2):** Gmail API intake, Gemini triage prompt, and database lead schema creation.
* **Phase 2 (Week 3):** SLA calculation engine, 4-day reminder automated scheduler, and PIC contact logging UI.
* **Phase 3 (Week 4):** Gemini Quotation Generation API integration and structured line-item editor.
* **Phase 4 (Week 5):** Finance approval gate UI, PDF generation, dispatch automation (Email/WhatsApp), and end-to-end UAT.