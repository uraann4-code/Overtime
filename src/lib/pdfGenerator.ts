import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { numberToWords } from './utils';

export function generateOvertimePDF(user: any, claim: any) {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BAHRIA UNIVERSITY OVERTIME CLAIM FORM', 105, 15, { align: 'center' });
  
  // User Info
  doc.setFontSize(10);
  doc.text(`NAME: ${user.name.toUpperCase()}`, 15, 25);
  doc.text(`DESIGNATION: ${user.designation.toUpperCase()}`, 75, 25);
  doc.text(`DEPARTMENT: ${user.department.toUpperCase()}`, 145, 25);
  
  doc.text(`MONTH OF: ${claim.month.toUpperCase()} ${claim.year}`, 15, 32);
  doc.text(`PAY SCALE: ${user.payScale}`, 75, 32);
  doc.text(`BANK A/C NO: ${user.bankAccount} ${user.bankName.toUpperCase()}`, 115, 32);
  
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
  
  // Fill empty rows to match the sample look (optional but nice)
  while (tableData.length < 15) {
    tableData.push(['', '', '', '', '', '', '']);
  }
  
  (doc as any).autoTable({
    startY: 40,
    head: [['DATE', 'DAY', 'NATURE OF DUTY', 'RFID TIMING FROM', 'RFID TIMING TO', 'HRS', 'AMOUNT']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0], halign: 'center' },
    styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 20 },
      2: { cellWidth: 60 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 25, halign: 'right' }
    },
    foot: [['TOTAL HOURS & AMOUNT', '', '', '', '', claim.totalHours, claim.totalAmount]],
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0], fontStyle: 'bold' }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 150;
  
  // Footer text
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Overtime @ Rs. 120 Per Hour for week days & Rs 160 for weekend & Rs 200 for gazetted holiday:', 15, finalY + 10);
  doc.text(`Total Claim Amount in Rupees: ${numberToWords(claim.totalAmount)} Employee's Sign:_______`, 15, finalY + 17);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Approved / Not Approved', 105, finalY + 27, { align: 'center' });
  
  doc.text("HOD's Signature", 15, finalY + 45);
  doc.text('Director / Dy. Registrar (A) Signature', 195, finalY + 45, { align: 'right' });
  
  doc.save(`Overtime_Claim_${user.name}_${claim.month}_${claim.year}.pdf`);
}
