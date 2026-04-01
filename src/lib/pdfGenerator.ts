import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToWords } from './utils';

export function generateOvertimePDF(user: any, claim: any) {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BAHRIA UNIVERSITY OVERTIME CLAIM FORM', 105, 15, { align: 'center' });
  
  // User Info
  doc.setFontSize(10);
  
  // Line 1
  doc.setFont('helvetica', 'bold');
  doc.text('NAME:', 15, 25);
  doc.setFont('helvetica', 'normal');
  doc.text(`${(user.name || '').toUpperCase()}`, 28, 25);
  
  doc.setFont('helvetica', 'bold');
  doc.text('DESIGNATION:', 85, 25);
  doc.setFont('helvetica', 'normal');
  doc.text(`${(user.designation || '').toUpperCase()}`, 115, 25);
  
  doc.setFont('helvetica', 'bold');
  doc.text('DEPARTMENT:', 155, 25);
  doc.setFont('helvetica', 'normal');
  doc.text(`${(user.department || '').toUpperCase()}`, 185, 25);
  
  // Line 2
  doc.setFont('helvetica', 'bold');
  doc.text('MONTH OF:', 15, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${(claim.month || '').toUpperCase()} ${claim.year || ''}`, 38, 32);
  
  doc.setFont('helvetica', 'bold');
  doc.text('PAY SCALE:', 85, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${user.payScale || ''}`, 108, 32);
  
  doc.setFont('helvetica', 'bold');
  doc.text('BANK A/C NO:', 125, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${user.bankAccount || ''} ${(user.bankName || '').toUpperCase()}`, 152, 32);
  
  // Table
  const tableData = claim.entries.map((entry: any) => [
    entry.date,
    entry.day,
    entry.natureOfDuty,
    entry.fromTime,
    entry.toTime,
    entry.hours,
    entry.amount
  ]);
  
  // Fill empty rows to match the sample look
  while (tableData.length < 15) {
    tableData.push(['', '', '', '', '', '', '']);
  }
  
  autoTable(doc, {
    startY: 40,
    head: [
      [
        { content: 'DATE', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'DAY', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'NATURE OF DUTY', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'RFID TIMING', colSpan: 2, styles: { halign: 'center' } },
        { content: 'HRS', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'AMOUNT', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
      ],
      [
        { content: 'FROM', styles: { halign: 'center' } },
        { content: 'TO', styles: { halign: 'center' } }
      ]
    ],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0] },
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 65, halign: 'left' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 25, halign: 'center' }
    },
    foot: [[
      { content: 'TOTAL HOURS & AMOUNT', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold' } },
      { content: claim.totalHours.toString(), styles: { halign: 'center', fontStyle: 'normal' } },
      { content: claim.totalAmount.toString(), styles: { halign: 'center', fontStyle: 'normal' } }
    ]],
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0] }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 150;
  
  const weekdayRate = user.weekdayRate || 120;
  const weekendRate = user.weekendRate || 160;
  const holidayRate = user.holidayRate || 200;

  // Footer text
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Overtime @ Rs. ${weekdayRate} Per Hour for week days & Rs ${weekendRate} for weekend & Rs ${holidayRate} for gazetted holiday:`, 15, finalY + 10);
  doc.text(`Total Claim Amount in Rupees: ${numberToWords(claim.totalAmount)} Only`, 15, finalY + 17);
  doc.text(`Employee's Sign:_________________`, 140, finalY + 17);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Approved / Not Approved', 105, finalY + 30, { align: 'center' });
  
  doc.text("HOD's Signature", 15, finalY + 50);
  doc.text('Director / Dy. Registrar (A) Signature', 195, finalY + 50, { align: 'right' });
  
  doc.save(`Overtime_Claim_${user.name || 'User'}_${claim.month || ''}_${claim.year || ''}.pdf`);
}
