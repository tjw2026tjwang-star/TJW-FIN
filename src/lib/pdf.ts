import { jsPDF } from 'jspdf';
import type { Lead, Quotation } from '../types';
import { formatDateShort, formatDateTime, formatMyr } from './sla';

export function downloadQuotationPdf(quotation: Quotation, lead: Lead | undefined) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  // Header band in Deep Crimson (#CB3737)
  doc.setFillColor(203, 55, 55);
  doc.rect(0, 0, pageWidth, 84, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('T.J. WANG FINANCE DEPARTMENT', margin, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 235, 235);
  doc.text(
    'Company Secretarial  |  Accounting & SST  |  Statutory Audit  |  Tax Advisory  |  Payroll',
    margin,
    55
  );
  doc.text('Corporate Advisory & Finance Operations · Malaysia', margin, 69);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(
    quotation.isApproved ? 'ADMINISTRATOR APPROVED' : 'PENDING ADMINISTRATOR APPROVAL',
    pageWidth - margin,
    37,
    { align: 'right' }
  );
  doc.setFontSize(11);
  doc.text(quotation.quoteNumber, pageWidth - margin, 55, { align: 'right' });

  y = 112;

  // Client & Quote Meta
  doc.setTextColor(23, 23, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PREPARED FOR', margin, y);
  doc.text('PROPOSAL DETAILS', pageWidth - margin - 185, y);

  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(quotation.companyName, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(82, 82, 82);
  doc.text(`Lead Ref: ${lead?.leadCode || quotation.leadId}`, pageWidth - margin - 185, y);

  y += 15;
  doc.text(`Attention: ${lead?.contactPerson || 'Board of Directors'}`, margin, y);
  doc.text(`Issue Date: ${formatDateShort(new Date().toISOString())}`, pageWidth - margin - 185, y);

  y += 14;
  doc.text(
    `Contact: ${[lead?.contactEmail, lead?.contactPhone].filter(Boolean).join(' · ') || 'On file'}`,
    margin,
    y
  );
  doc.text('Validity: 30 Calendar Days', pageWidth - margin - 185, y);

  if (lead?.entityType) {
    y += 14;
    doc.text(
      `Entity Profile: ${lead.entityType}${lead.scope.sstRegistered ? ' (SST Registered)' : ''}`,
      margin,
      y
    );
  }

  y += 20;
  doc.setDrawColor(227, 227, 227);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Table Header
  doc.setFillColor(250, 250, 250);
  doc.rect(margin, y - 13, contentWidth, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(64, 64, 64);
  doc.text('DEPT', margin + 6, y);
  doc.text('SERVICE & DELIVERABLES', margin + 74, y);
  doc.text('CYCLE', margin + 332, y);
  doc.text('QTY', margin + 388, y, { align: 'right' });
  doc.text('UNIT (RM)', margin + 448, y, { align: 'right' });
  doc.text('TOTAL (RM)', pageWidth - margin - 6, y, { align: 'right' });

  y += 18;

  for (const item of quotation.lineItems) {
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
    doc.setTextColor(23, 23, 23);
    doc.text(item.dept, margin + 6, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(38, 38, 38);
    doc.text(descLines, margin + 74, y);

    doc.setTextColor(82, 82, 82);
    doc.text(item.frequency, margin + 332, y);
    doc.text(String(item.quantity), margin + 388, y, { align: 'right' });
    doc.text(
      item.unitPriceMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 }),
      margin + 448,
      y,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(23, 23, 23);
    doc.text(
      item.lineTotalMyr.toLocaleString('en-MY', { minimumFractionDigits: 2 }),
      pageWidth - margin - 6,
      y,
      { align: 'right' }
    );

    y += rowHeight;
    doc.setDrawColor(235, 235, 235);
    doc.line(margin, y - 6, pageWidth - margin, y - 6);
  }

  y += 10;
  if (y > 640) {
    doc.addPage();
    y = 54;
  }

  // Totals Summary Box
  const boxX = pageWidth - margin - 240;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(227, 227, 227);
  doc.rect(boxX, y, 240, 94, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 82);
  doc.text('Setup Fee Total (One-off):', boxX + 12, y + 18);
  doc.text(formatMyr(quotation.totalSetupFeeMyr), boxX + 228, y + 18, { align: 'right' });

  doc.text('Monthly Recurring Total:', boxX + 12, y + 36);
  doc.text(`${formatMyr(quotation.totalMonthlyRecurringMyr)} / mo`, boxX + 228, y + 36, {
    align: 'right',
  });

  doc.text('Annual Recurring Total:', boxX + 12, y + 54);
  doc.text(`${formatMyr(quotation.totalAnnualRecurringMyr)} / yr`, boxX + 228, y + 54, {
    align: 'right',
  });

  doc.setDrawColor(210, 210, 210);
  doc.line(boxX + 12, y + 65, boxX + 228, y + 65);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(23, 23, 23);
  doc.text('Est. Year-1 Total Value:', boxX + 12, y + 82);
  doc.text(formatMyr(quotation.totalYearOneMyr), boxX + 228, y + 82, { align: 'right' });

  y += 116;

  const sections = [
    { title: 'ENGAGEMENT TERMS & REMARKS', body: quotation.legalRemarks },
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
    doc.setTextColor(23, 23, 23);
    doc.text(sec.title, margin, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 82);
    doc.text(lines, margin, y);
    y += lines.length * 11.5 + 14;
  }

  if (y > 720) {
    doc.addPage();
    y = 54;
  }
  doc.setDrawColor(227, 227, 227);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);

  if (quotation.isApproved) {
    doc.setTextColor(22, 101, 52);
    doc.text(
      `Approved by Administrator: ${quotation.approvedBy}  |  Approved at ${formatDateTime(quotation.approvedAt)}`,
      margin,
      y
    );
  } else {
    doc.setTextColor(203, 55, 55);
    doc.text(
      'INTERNAL DRAFT — LOCKED FOR DISPATCH UNTIL ADMINISTRATOR APPROVAL IS RECORDED.',
      margin,
      y
    );
  }

  doc.save(`${quotation.quoteNumber}_${quotation.companyName.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`);
}

export function buildWhatsAppProposal(quotation: Quotation, lead: Lead | undefined) {
  const itemLines = quotation.lineItems
    .map(
      (item, idx) =>
        `${idx + 1}. [${item.dept}] ${item.description} — ${formatMyr(item.lineTotalMyr)} (${item.frequency})`
    )
    .join('\n');

  const message = [
    `Dear ${lead?.contactPerson || 'Director'},`,
    '',
    `Thank you for speaking with T.J. Wang's Finance Department regarding ${quotation.companyName}. Please find our approved fee proposal (${quotation.quoteNumber}):`,
    '',
    itemLines,
    '',
    `Fee Summary:`,
    `- Setup Fee Total (One-off): ${formatMyr(quotation.totalSetupFeeMyr)}`,
    `- Monthly Recurring Total: ${formatMyr(quotation.totalMonthlyRecurringMyr)} / month`,
    `- Annual Recurring Total: ${formatMyr(quotation.totalAnnualRecurringMyr)} / year`,
    `- Estimated Year-1 Total: ${formatMyr(quotation.totalYearOneMyr)}`,
    '',
    `This quotation is valid for 30 calendar days. Please let us know if you would like us to issue the formal Letter of Engagement.`,
    '',
    `Warm regards,`,
    `T.J. Wang Finance Department`,
  ].join('\n');

  const cleanPhone = (lead?.contactPhone || '').replace(/[^\d]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? `6${cleanPhone}` : cleanPhone;
  const waUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { message, waUrl };
}

export function buildEmailProposal(quotation: Quotation, lead: Lead | undefined) {
  const to = lead?.contactEmail || '';
  const subject = `Fee Proposal ${quotation.quoteNumber} — ${quotation.companyName} | T.J. Wang Finance Department`;
  const { message } = buildWhatsAppProposal(quotation, lead);
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  return { to, subject, body: message, mailtoUrl };
}
