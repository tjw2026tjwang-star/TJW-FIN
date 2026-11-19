import { jsPDF } from 'jspdf';
import type { Lead, Quotation, QuotationLineItem } from '../types';
import { formatDateShort, formatDateTime, formatMyr } from './sla';

export function downloadQuotationPdf(
  quotation: Quotation,
  lead: Lead | undefined,
  lineItems: QuotationLineItem[]
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 86, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('MERIDIAN CORPORATE ADVISORY SDN BHD', margin, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    'Company Secretarial  |  Accounting & SST  |  Statutory Audit  |  Tax Advisory  |  Payroll',
    margin,
    56
  );
  doc.text('Level 24, Menara Sentral Vista, 50470 Kuala Lumpur, Malaysia', margin, 70);

  // Proposal status stamp on right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  if (quotation.isApproved) {
    doc.setTextColor(134, 239, 172);
    doc.text('FINANCE APPROVED', pageWidth - margin, 38, { align: 'right' });
  } else {
    doc.setTextColor(253, 224, 71);
    doc.text('DRAFT — UNAPPROVED', pageWidth - margin, 38, { align: 'right' });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(quotation.quoteNumber, pageWidth - margin, 56, { align: 'right' });

  y = 112;

  // Client & Quote Meta Grid
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PREPARED FOR', margin, y);
  doc.text('PROPOSAL DETAILS', pageWidth - margin - 180, y);

  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(quotation.companyName, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Ref Lead: ${lead?.leadCode || quotation.leadId}`, pageWidth - margin - 180, y);

  y += 15;
  doc.text(`Attention: ${lead?.contactPerson || 'Board of Directors'}`, margin, y);
  doc.text(`Date: ${formatDateShort(new Date().toISOString())}`, pageWidth - margin - 180, y);

  y += 14;
  doc.text(
    `Contact: ${[lead?.contactEmail, lead?.contactPhone].filter(Boolean).join(' · ') || 'On file'}`,
    margin,
    y
  );
  doc.text('Validity: 30 Calendar Days', pageWidth - margin - 180, y);

  if (lead?.entityType) {
    y += 14;
    doc.text(
      `Entity Profile: ${lead.entityType}${lead.sstRegistered ? ' (SST Registered)' : ''}`,
      margin,
      y
    );
  }

  y += 22;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 13, contentWidth, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('CATEGORY', margin + 6, y);
  doc.text('SCOPE & DELIVERABLES', margin + 74, y);
  doc.text('CYCLE', margin + 332, y);
  doc.text('QTY', margin + 388, y, { align: 'right' });
  doc.text('UNIT (RM)', margin + 448, y, { align: 'right' });
  doc.text('TOTAL (RM)', pageWidth - margin - 6, y, { align: 'right' });

  y += 18;

  // Line Items
  doc.setFont('helvetica', 'normal');
  for (const item of lineItems) {
    if (y > 700) {
      doc.addPage();
      y = 54;
    }

    const descLines = doc.splitTextToSize(
      `${item.description}${item.deliverables ? `\nDeliverables: ${item.deliverables}` : ''}`,
      248
    );
    const rowHeight = Math.max(24, descLines.length * 12 + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(item.serviceCategory, margin + 6, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(descLines, margin + 74, y);

    doc.setTextColor(71, 85, 105);
    doc.text(item.frequency, margin + 332, y);
    doc.text(String(item.quantity), margin + 388, y, { align: 'right' });
    doc.text(item.unitPriceMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 }), margin + 448, y, {
      align: 'right',
    });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(
      item.lineTotalMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 }),
      pageWidth - margin - 6,
      y,
      { align: 'right' }
    );

    y += rowHeight;
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y - 6, pageWidth - margin, y - 6);
  }

  y += 10;
  if (y > 650) {
    doc.addPage();
    y = 54;
  }

  // Totals Summary Box
  const boxX = pageWidth - margin - 235;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(boxX, y, 235, 92, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('One-off Setup & Filing Fees:', boxX + 12, y + 18);
  doc.text(formatMyr(quotation.totalSetupMyr), boxX + 223, y + 18, { align: 'right' });

  doc.text('Monthly Recurring Retainer:', boxX + 12, y + 35);
  doc.text(`${formatMyr(quotation.totalMonthlyMyr)} / mo`, boxX + 223, y + 35, { align: 'right' });

  doc.text('Annual Statutory Fees:', boxX + 12, y + 52);
  doc.text(`${formatMyr(quotation.totalAnnualMyr)} / yr`, boxX + 223, y + 52, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(boxX + 12, y + 63, boxX + 223, y + 63);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Est. Year-1 Total Value:', boxX + 12, y + 80);
  doc.text(formatMyr(quotation.totalContractValueMyr), boxX + 223, y + 80, { align: 'right' });

  y += 116;

  // Remarks, Assumptions, Exclusions
  const sections = [
    { title: 'ENGAGEMENT TERMS & LEGAL REMARKS', body: quotation.legalRemarks },
    { title: 'KEY SCOPING ASSUMPTIONS', body: quotation.assumptions },
    { title: 'OUT-OF-SCOPE EXCLUSIONS', body: quotation.exclusions },
  ];

  for (const sec of sections) {
    if (!sec.body) continue;
    const lines = doc.splitTextToSize(sec.body, contentWidth);
    if (y + lines.length * 12 + 24 > 770) {
      doc.addPage();
      y = 54;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sec.title, margin, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(lines, margin, y);
    y += lines.length * 11.5 + 14;
  }

  // Finance Approval Sign-off Footer
  if (y > 720) {
    doc.addPage();
    y = 54;
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  if (quotation.isApproved) {
    doc.text(
      `Authorized by Finance Leadership: ${quotation.approvedByName || 'Finance Director'}  |  Approved at ${formatDateTime(quotation.approvedAtIso)}`,
      margin,
      y
    );
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text(
      'INTERNAL DRAFT ONLY — NOT AUTHORIZED FOR CLIENT DISPATCH UNTIL FINANCE DIRECTOR APPROVAL.',
      margin,
      y
    );
  }

  doc.save(`${quotation.quoteNumber}_${quotation.companyName.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`);
}

export function buildWhatsAppProposalSummary(
  quotation: Quotation,
  lead: Lead | undefined,
  lineItems: QuotationLineItem[]
): { message: string; waUrl: string } {
  const itemLines = lineItems
    .map(
      (item, idx) =>
        `${idx + 1}. [${item.serviceCategory}] ${item.description} — ${formatMyr(item.lineTotalMyr)} (${item.frequency})`
    )
    .join('\n');

  const message = [
    `Dear ${lead?.contactPerson || 'Director'},`,
    '',
    `Thank you for speaking with our Corporate Advisory team regarding ${quotation.companyName}. Please find our Finance-approved fee proposal (${quotation.quoteNumber}):`,
    '',
    itemLines,
    '',
    `Summary:`,
    `- One-off Setup: ${formatMyr(quotation.totalSetupMyr)}`,
    `- Monthly Retainer: ${formatMyr(quotation.totalMonthlyMyr)} / month`,
    `- Annual Statutory: ${formatMyr(quotation.totalAnnualMyr)} / year`,
    `- Estimated Year-1 Total: ${formatMyr(quotation.totalContractValueMyr)}`,
    '',
    `The full PDF proposal with deliverables and terms is attached. Valid for 30 days. Let us know if you would like to proceed.`,
    '',
    `Warm regards,`,
    `Meridian Corporate Advisory Sdn Bhd`,
  ].join('\n');

  const cleanPhone = (lead?.contactPhone || '').replace(/[^\d]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? `6${cleanPhone}` : cleanPhone;
  const waUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { message, waUrl };
}

export function buildEmailProposalDraft(
  quotation: Quotation,
  lead: Lead | undefined,
  lineItems: QuotationLineItem[]
): { to: string; subject: string; body: string; mailtoUrl: string } {
  const to = lead?.contactEmail || '';
  const subject = `Corporate Advisory Proposal ${quotation.quoteNumber} — ${quotation.companyName}`;
  const { message } = buildWhatsAppProposalSummary(quotation, lead, lineItems);
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  return { to, subject, body: message, mailtoUrl };
}
