import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OKIRU_LOGO_BASE64 } from "./logo";

interface ExportOptions {
  analystName?: string;
  reportNotes?: string;
  includeDraft2026?: boolean;
  certificateNumber?: string;
}

function formatCurrency(value: number): string {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function getLevelColor(level: number): [number, number, number] {
  if (level <= 2) return [109, 40, 217];
  if (level <= 4) return [139, 92, 246];
  if (level <= 6) return [245, 158, 11];
  return [239, 68, 68];
}

const PURPLE: [number, number, number] = [109, 40, 217];
const PURPLE_LIGHT: [number, number, number] = [139, 92, 246];
const PURPLE_FAINT: [number, number, number] = [245, 240, 255];
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_700: [number, number, number] = [51, 65, 85];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_200: [number, number, number] = [226, 232, 240];
const WHITE: [number, number, number] = [255, 255, 255];

const TEAL: [number, number, number] = [13, 148, 136];
const TEAL_LIGHT: [number, number, number] = [204, 251, 241];
const BLUE: [number, number, number] = [37, 99, 235];
const BLUE_LIGHT: [number, number, number] = [219, 234, 254];
const EMERALD: [number, number, number] = [5, 150, 105];
const EMERALD_LIGHT: [number, number, number] = [209, 250, 229];
const AMBER: [number, number, number] = [217, 119, 6];
const AMBER_LIGHT: [number, number, number] = [254, 243, 199];
const ROSE: [number, number, number] = [190, 18, 60];
const ROSE_LIGHT: [number, number, number] = [255, 228, 230];
const INDIGO: [number, number, number] = [79, 70, 229];
const INDIGO_LIGHT: [number, number, number] = [224, 231, 255];

interface SectionTheme {
  header: [number, number, number];
  headerText: [number, number, number];
  altRow: [number, number, number];
  accent: [number, number, number];
}

const SECTION_THEMES: Record<string, SectionTheme> = {
  scorecard: { header: PURPLE, headerText: WHITE, altRow: PURPLE_FAINT, accent: PURPLE },
  ownership: { header: INDIGO, headerText: WHITE, altRow: INDIGO_LIGHT, accent: INDIGO },
  management: { header: TEAL, headerText: WHITE, altRow: TEAL_LIGHT, accent: TEAL },
  skills: { header: EMERALD, headerText: WHITE, altRow: EMERALD_LIGHT, accent: EMERALD },
  procurement: { header: AMBER, headerText: WHITE, altRow: AMBER_LIGHT, accent: AMBER },
  esd: { header: ROSE, headerText: WHITE, altRow: ROSE_LIGHT, accent: ROSE },
  sed: { header: BLUE, headerText: WHITE, altRow: BLUE_LIGHT, accent: BLUE },
};

function drawCertificateBorder(doc: jsPDF) {
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;

  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(2);
  doc.rect(10, 10, w - 20, h - 20);

  doc.setLineWidth(0.5);
  doc.rect(14, 14, w - 28, h - 28);

  doc.setDrawColor(...PURPLE_LIGHT);
  doc.setLineWidth(0.3);
  const cornerLen = 20;
  [[14, 14, 1, 1], [w - 14, 14, -1, 1], [14, h - 14, 1, -1], [w - 14, h - 14, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    doc.line(cx as number, cy as number, (cx as number) + cornerLen * (dx as number), cy as number);
    doc.line(cx as number, cy as number, cx as number, (cy as number) + cornerLen * (dy as number));
  });
}

function drawSeal(doc: jsPDF, x: number, y: number, level: number) {
  const r = 18;
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(1.5);
  doc.circle(x, y, r);
  doc.setLineWidth(0.5);
  doc.circle(x, y, r - 3);

  const points = 12;
  doc.setDrawColor(...PURPLE_LIGHT);
  doc.setLineWidth(0.3);
  for (let i = 0; i < points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const innerR = r - 6;
    const outerR = r - 3;
    const x1 = x + Math.cos(angle) * innerR;
    const y1 = y + Math.sin(angle) * innerR;
    const x2 = x + Math.cos(angle) * outerR;
    const y2 = y + Math.sin(angle) * outerR;
    doc.line(x1, y1, x2, y2);
  }

  doc.setFontSize(7);
  doc.setTextColor(...PURPLE);
  doc.text("B-BBEE", x, y - 5, { align: "center" });
  doc.setFontSize(16);
  doc.setTextColor(...PURPLE);
  doc.text(level >= 9 ? "N/C" : `L${level}`, x, y + 2, { align: "center" });
  doc.setFontSize(6);
  doc.text("VERIFIED", x, y + 7, { align: "center" });
}

function addPageHeader(doc: jsPDF, title: string, theme?: SectionTheme) {
  const w = doc.internal.pageSize.width;
  const headerColor = theme?.header || PURPLE;
  const accentColor = theme?.accent || PURPLE_LIGHT;

  doc.setFillColor(...headerColor);
  doc.rect(0, 0, w, 10, 'F');

  doc.setFillColor(...accentColor);
  doc.setGlobalAlpha?.(0.6);
  doc.rect(0, 10, w, 2, 'F');
  doc.setGlobalAlpha?.(1);

  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text(title, w / 2, 7, { align: "center" });
}

function addPageFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;

  doc.setDrawColor(...SLATE_200);
  doc.line(20, h - 18, w - 20, h - 18);

  doc.setFontSize(7);
  doc.setTextColor(...SLATE_400);
  doc.text("Generated by Okiru.Pro B-BBEE Compliance Intelligence Platform", 20, h - 12);
  doc.text(`Page ${pageNum} of ${totalPages}`, w - 20, h - 12, { align: "right" });
}

function addSectionTitle(doc: jsPDF, title: string, y: number, margin: number, theme: SectionTheme): number {
  doc.setFontSize(14);
  doc.setTextColor(...theme.accent);
  doc.text(title, margin, y);
  y += 2;
  doc.setDrawColor(...theme.accent);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 35, y);
  return y + 7;
}

export const exportCertificatePdf = (state: any, options: ExportOptions = {}) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const today = new Date();
  const currentLevel = state.scorecard.isDiscounted ? state.scorecard.discountedLevel : state.scorecard.achievedLevel;
  const certNumber = options.certificateNumber || `OKR-${today.getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;

  drawCertificateBorder(doc);

  doc.setFontSize(9);
  doc.setTextColor(...SLATE_400);
  doc.text(`Certificate No: ${certNumber}`, pageWidth / 2, 22, { align: "center" });

  try {
    doc.addImage(OKIRU_LOGO_BASE64, 'PNG', pageWidth / 2 - 20, 28, 40, 10);
  } catch {}

  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 50, 42, pageWidth / 2 + 50, 42);

  doc.setFontSize(11);
  doc.setTextColor(...PURPLE);
  doc.text("BROAD-BASED BLACK ECONOMIC EMPOWERMENT", pageWidth / 2, 52, { align: "center" });

  doc.setFontSize(26);
  doc.setTextColor(...SLATE_900);
  doc.text("Certificate of Compliance", pageWidth / 2, 66, { align: "center" });

  doc.setDrawColor(...PURPLE_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - 35, 70, pageWidth / 2 + 35, 70);

  doc.setFontSize(10);
  doc.setTextColor(...SLATE_500);
  doc.text("This is to certify that", pageWidth / 2, 82, { align: "center" });

  doc.setFontSize(22);
  doc.setTextColor(...SLATE_900);
  doc.text(state.client.name, pageWidth / 2, 96, { align: "center" });

  if (state.client.tradeName) {
    doc.setFontSize(12);
    doc.setTextColor(...SLATE_500);
    doc.text(`trading as ${state.client.tradeName}`, pageWidth / 2, 104, { align: "center" });
  }

  doc.setFontSize(10);
  doc.setTextColor(...SLATE_500);
  doc.text("has been assessed and awarded the following B-BBEE status:", pageWidth / 2, 114, { align: "center" });

  const boxW = 120;
  const boxX = pageWidth / 2 - boxW / 2;

  doc.setFillColor(...PURPLE_FAINT);
  doc.roundedRect(boxX, 122, boxW, 42, 4, 4, 'F');
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.8);
  doc.roundedRect(boxX, 122, boxW, 42, 4, 4, 'S');

  doc.setFontSize(28);
  doc.setTextColor(...PURPLE);
  doc.text(currentLevel >= 9 ? 'Non-Compliant' : `Level ${currentLevel}`, pageWidth / 2, 142, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(...SLATE_700);
  doc.text(`Recognition Level: ${state.scorecard.recognitionLevel}`, pageWidth / 2, 155, { align: "center" });

  const detailY = 175;
  const col1X = margin + 10;
  const col2X = pageWidth / 2 + 5;

  doc.setFontSize(9);
  doc.setTextColor(...SLATE_400);
  doc.text("Total Score", col1X, detailY);
  doc.text("Financial Year", col2X, detailY);
  doc.setFontSize(13);
  doc.setTextColor(...SLATE_900);
  doc.text(`${state.scorecard.total.score.toFixed(2)} / 127`, col1X, detailY + 7);
  doc.text(state.client.financialYear, col2X, detailY + 7);

  doc.setFontSize(9);
  doc.setTextColor(...SLATE_400);
  doc.text("Industry Sector", col1X, detailY + 18);
  doc.text("Assessment Date", col2X, detailY + 18);
  doc.setFontSize(13);
  doc.setTextColor(...SLATE_900);
  doc.text(state.client.industrySector || "Generic", col1X, detailY + 25);
  doc.text(formatDate(today), col2X, detailY + 25);

  doc.setFontSize(9);
  doc.setTextColor(...SLATE_400);
  doc.text("Applicable Scorecard", col1X, detailY + 36);
  doc.text("Verification Analyst", col2X, detailY + 36);
  doc.setFontSize(11);
  doc.setTextColor(...SLATE_900);
  doc.text("Amended Codes of Good Practice", col1X, detailY + 43);
  doc.text(options.analystName || "Verification Analyst", col2X, detailY + 43);

  drawSeal(doc, pageWidth - 45, detailY + 20, currentLevel);

  doc.setDrawColor(...SLATE_200);
  doc.line(col1X, pageHeight - 46, col1X + 50, pageHeight - 46);
  doc.line(col2X, pageHeight - 46, col2X + 50, pageHeight - 46);
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_400);
  doc.text("Authorized Signature", col1X, pageHeight - 40);
  doc.text("Date", col2X, pageHeight - 40);
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  doc.text(options.analystName || "________________", col1X, pageHeight - 35);
  doc.text(formatDate(today), col2X, pageHeight - 35);

  doc.setFontSize(7);
  doc.setTextColor(...SLATE_400);
  doc.text("This assessment is based on information provided by the measured entity and the Amended Codes of Good Practice.", pageWidth / 2, pageHeight - 22, { align: "center" });

  doc.addPage();
  addPageHeader(doc, "ENTITY DETAILS & SCORECARD OVERVIEW", SECTION_THEMES.scorecard);

  let y = 20;

  y = addSectionTitle(doc, "Entity Details", y, margin, SECTION_THEMES.scorecard);

  const entityData = [
    ["Company Name", state.client.name],
    ["Financial Year", state.client.financialYear],
    ["Industry Sector", state.client.industrySector || "Generic"],
    ["EAP Province", state.client.eapProvince || "National"],
    ["Revenue", formatCurrency(state.client.revenue)],
    ["Net Profit After Tax (NPAT)", formatCurrency(state.client.npat)],
    ["Leviable Amount", formatCurrency(state.client.leviableAmount)],
  ];

  autoTable(doc, {
    startY: y,
    body: entityData,
    theme: 'striped',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70, textColor: SLATE_700 },
      1: { textColor: SLATE_900 }
    },
    alternateRowStyles: { fillColor: [250, 248, 255] },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  y = addSectionTitle(doc, "Scorecard Overview", y, margin, SECTION_THEMES.scorecard);

  const pillarColors: Record<string, [number, number, number]> = {
    "Ownership": INDIGO,
    "Management Control": TEAL,
    "Skills Development": EMERALD,
    "Preferential Procurement": AMBER,
    "Enterprise & Supplier Dev": ROSE,
    "Socio-Economic Dev": BLUE,
  };

  autoTable(doc, {
    startY: y,
    head: [["Element", "Points", "Target", "Achievement", "Sub-min"]],
    body: [
      ["Ownership", state.scorecard.ownership.score.toFixed(2), "25", `${((state.scorecard.ownership.score / 25) * 100).toFixed(0)}%`, state.scorecard.ownership.subMinimumMet ? "Passed" : "Failed"],
      ["Management Control", state.scorecard.managementControl.score.toFixed(2), "27", `${((state.scorecard.managementControl.score / 27) * 100).toFixed(0)}%`, "N/A"],
      ["Skills Development", state.scorecard.skillsDevelopment.score.toFixed(2), "25", `${((state.scorecard.skillsDevelopment.score / 25) * 100).toFixed(0)}%`, state.scorecard.skillsDevelopment.subMinimumMet ? "Passed" : "Failed"],
      ["Preferential Procurement", state.scorecard.procurement.score.toFixed(2), "25", `${((state.scorecard.procurement.score / 25) * 100).toFixed(0)}%`, state.scorecard.procurement.subMinimumMet ? "Passed" : "Failed"],
      ["Enterprise & Supplier Dev", state.scorecard.enterpriseDevelopment.score.toFixed(2), "15", `${((state.scorecard.enterpriseDevelopment.score / 15) * 100).toFixed(0)}%`, "N/A"],
      ["Socio-Economic Dev", state.scorecard.socioEconomicDevelopment.score.toFixed(2), "5", `${((state.scorecard.socioEconomicDevelopment.score / 5) * 100).toFixed(0)}%`, "N/A"],
      ["YES Initiative", (state.scorecard.yesInitiative?.score || 0).toFixed(2), "5", "0%", "N/A"],
    ],
    foot: [["TOTAL", state.scorecard.total.score.toFixed(2), "127", `${((state.scorecard.total.score / 127) * 100).toFixed(0)}%`, state.scorecard.isDiscounted ? "DISCOUNTED" : "ALL PASSED"]],
    theme: 'grid',
    headStyles: { fillColor: PURPLE, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: [248, 244, 255], textColor: SLATE_900, fontStyle: 'bold', fontSize: 9, lineWidth: 0.3, lineColor: PURPLE_LIGHT },
    styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [220, 220, 230] },
    columnStyles: {
      3: { halign: 'center' },
      4: { halign: 'center' }
    },
    margin: { left: margin, right: margin },
    didParseCell: function(data) {
      if (data.section === 'body') {
        const elementName = data.row.cells[0]?.raw as string;
        const rowColor = pillarColors[elementName];

        if (data.column.index === 0 && rowColor) {
          data.cell.styles.textColor = rowColor;
          data.cell.styles.fontStyle = 'bold';
        }

        if (data.row.index % 2 === 0) {
          data.cell.styles.fillColor = [250, 250, 252];
        } else {
          data.cell.styles.fillColor = [255, 255, 255];
        }

        if (data.column.index === 4) {
          if (data.cell.raw === 'Failed') {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          } else if (data.cell.raw === 'Passed') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    }
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  y = addSectionTitle(doc, "B-BBEE Status Summary", y, margin, SECTION_THEMES.scorecard);

  const totalShareholders = state.ownership?.shareholders || [];
  const totalShares = totalShareholders.reduce((sum: number, sh: any) => sum + (sh.shares || 0), 0);
  const totalBlackOwnership = totalShares > 0
    ? totalShareholders.reduce((sum: number, sh: any) => sum + ((sh.shares / totalShares) * sh.blackOwnership * 100), 0)
    : 0;
  const totalBlackFemale = totalShares > 0
    ? totalShareholders.reduce((sum: number, sh: any) => sum + ((sh.shares / totalShares) * sh.blackWomenOwnership * 100), 0)
    : 0;

  const statusData = [
    ["B-BBEE Status Level", currentLevel >= 9 ? 'Non-Compliant' : `Level ${currentLevel}`],
    ["Recognition Level", state.scorecard.recognitionLevel],
    ["Black Ownership", `${totalBlackOwnership.toFixed(1)}%`],
    ["Black Women Ownership", `${totalBlackFemale.toFixed(1)}%`],
    ["Certificate Number", certNumber],
    ["Discounting Applied", state.scorecard.isDiscounted ? 'Yes' : 'No'],
  ];

  autoTable(doc, {
    startY: y,
    body: statusData,
    theme: 'striped',
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60, textColor: SLATE_500 },
      1: { textColor: SLATE_900, fontStyle: 'bold' }
    },
    alternateRowStyles: { fillColor: [250, 248, 255] },
    margin: { left: margin, right: margin },
  });

  doc.addPage();
  addPageHeader(doc, "OWNERSHIP ANALYSIS", SECTION_THEMES.ownership);

  y = 20;
  y = addSectionTitle(doc, "Ownership Breakdown", y, margin, SECTION_THEMES.ownership);

  if (totalShareholders.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Shareholder", "Type", "Black %", "BWO %", "Shares", "Value (ZAR)", "New Entrant"]],
      body: totalShareholders.map((sh: any) => [
        sh.name,
        (sh.ownershipType || 'shareholder').replace(/_/g, ' '),
        `${(sh.blackOwnership * 100).toFixed(0)}%`,
        `${(sh.blackWomenOwnership * 100).toFixed(0)}%`,
        sh.shares.toLocaleString(),
        formatCurrency(sh.shareValue),
        sh.blackNewEntrant ? 'Yes' : 'No'
      ]),
      theme: 'grid',
      headStyles: { fillColor: INDIGO, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [200, 200, 220] },
      alternateRowStyles: { fillColor: INDIGO_LIGHT },
      margin: { left: margin, right: margin },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 6) {
          if (data.cell.raw === 'Yes') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.setFillColor(...INDIGO_LIGHT);
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...INDIGO);
  doc.text(`Company Value: ${formatCurrency(state.ownership?.companyValue || 0)}    |    Outstanding Debt: ${formatCurrency(state.ownership?.outstandingDebt || 0)}    |    Years Held: ${state.ownership?.yearsHeld || 0}`, margin + 5, y + 9);

  doc.addPage();
  addPageHeader(doc, "MANAGEMENT CONTROL", SECTION_THEMES.management);

  y = 20;
  y = addSectionTitle(doc, "Management Control", y, margin, SECTION_THEMES.management);

  const employees = state.management?.employees || [];
  if (employees.length > 0) {
    const designations = ['Board', 'Executive Director', 'Other Executive Management', 'Senior', 'Middle', 'Junior'];
    const mgmtSummary = designations.map((d: string) => {
      const total = employees.filter((e: any) => e.designation === d).length;
      const black = employees.filter((e: any) => e.designation === d && ['African', 'Coloured', 'Indian'].includes(e.race)).length;
      const blackFemale = employees.filter((e: any) => e.designation === d && ['African', 'Coloured', 'Indian'].includes(e.race) && e.gender === 'Female').length;
      return [d, total.toString(), black.toString(), `${total > 0 ? ((black / total) * 100).toFixed(0) : '0'}%`, blackFemale.toString(), `${total > 0 ? ((blackFemale / total) * 100).toFixed(0) : '0'}%`];
    }).filter(row => parseInt(row[1]) > 0);

    autoTable(doc, {
      startY: y,
      head: [["Designation Level", "Total", "Black", "Black %", "Black Women", "BWO %"]],
      body: mgmtSummary,
      theme: 'grid',
      headStyles: { fillColor: TEAL, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [200, 220, 220] },
      alternateRowStyles: { fillColor: TEAL_LIGHT },
      columnStyles: {
        3: { halign: 'center' },
        5: { halign: 'center' }
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    const disabledCount = employees.filter((e: any) => e.isDisabled).length;
    const disabledBlack = employees.filter((e: any) => e.isDisabled && ['African', 'Coloured', 'Indian'].includes(e.race)).length;
    doc.setFillColor(...TEAL_LIGHT);
    doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setTextColor(...TEAL);
    doc.text(`Total Employees: ${employees.length}    |    Employees with Disabilities: ${disabledCount} (${disabledBlack} black)    |    Score: ${state.scorecard.managementControl.score.toFixed(2)} / 27`, margin + 5, y + 7);
    y += 18;
  }

  y = addSectionTitle(doc, "Skills Development", y, margin, SECTION_THEMES.skills);

  const programs = state.skills?.trainingPrograms || [];
  if (programs.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Program", "Category", "Cost (ZAR)", "Black", "Gender", "Race", "Disabled"]],
      body: programs.map((p: any) => [
        p.name,
        (p.category || '').replace(/_/g, ' '),
        formatCurrency(p.cost),
        p.isBlack ? "Yes" : "No",
        p.gender || "—",
        p.race || "—",
        p.isDisabled ? "Yes" : "No"
      ]),
      theme: 'grid',
      headStyles: { fillColor: EMERALD, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [200, 220, 200] },
      alternateRowStyles: { fillColor: EMERALD_LIGHT },
      margin: { left: margin, right: margin },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 3) {
          if (data.cell.raw === 'Yes') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    const totalSkillsSpend = programs.reduce((s: number, p: any) => s + (p.cost || 0), 0);
    const leviable = state.skills?.leviableAmount || 0;
    doc.setFillColor(...EMERALD_LIGHT);
    doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setTextColor(...EMERALD);
    doc.text(`Total Spend: ${formatCurrency(totalSkillsSpend)}    |    Leviable Amount: ${formatCurrency(leviable)}    |    Score: ${state.scorecard.skillsDevelopment.score.toFixed(2)} / 25`, margin + 5, y + 7);
  }

  doc.addPage();
  addPageHeader(doc, "PREFERENTIAL PROCUREMENT", SECTION_THEMES.procurement);

  y = 20;
  y = addSectionTitle(doc, "Preferential Procurement", y, margin, SECTION_THEMES.procurement);

  const suppliers = state.procurement?.suppliers || [];
  if (suppliers.length > 0) {
    const recognitionLevels: Record<number, number> = { 1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00, 5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0 };

    autoTable(doc, {
      startY: y,
      head: [["Supplier", "B-BBEE Level", "Recognition", "Black Own %", "Spend (ZAR)", "Recognised (ZAR)"]],
      body: suppliers.map((s: any) => {
        const recFactor = recognitionLevels[s.beeLevel] || 0;
        return [
          s.name,
          s.beeLevel === 0 ? "N/C" : `Level ${s.beeLevel}`,
          `${(recFactor * 100).toFixed(0)}%`,
          `${(s.blackOwnership * 100).toFixed(0)}%`,
          formatCurrency(s.spend),
          formatCurrency(s.spend * recFactor)
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: AMBER, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [220, 210, 190] },
      alternateRowStyles: { fillColor: AMBER_LIGHT },
      margin: { left: margin, right: margin },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 1) {
          const levelText = data.cell.raw as string;
          if (levelText === 'Level 1' || levelText === 'Level 2') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (levelText === 'N/C') {
            data.cell.styles.textColor = [239, 68, 68];
          }
        }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  doc.setFillColor(...AMBER_LIGHT);
  doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...AMBER);
  doc.text(`TMPS: ${formatCurrency(state.procurement?.tmps || 0)}    |    Score: ${state.scorecard.procurement.score.toFixed(2)} / 27 (Base 25 + DG Bonus 2)`, margin + 5, y + 7);

  doc.addPage();
  addPageHeader(doc, "ENTERPRISE, SUPPLIER & SOCIO-ECONOMIC DEVELOPMENT", SECTION_THEMES.esd);

  y = 20;
  y = addSectionTitle(doc, "Enterprise & Supplier Development", y, margin, SECTION_THEMES.esd);

  const npat = state.client.npat || 0;
  doc.setFillColor(...ROSE_LIGHT);
  doc.roundedRect(margin, y - 2, contentWidth, 14, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...ROSE);
  doc.text(`NPAT: ${formatCurrency(npat)}    |    SD Target (2%): ${formatCurrency(Math.abs(npat) * 0.02)}    |    ED Target (1%): ${formatCurrency(Math.abs(npat) * 0.01)}`, margin + 5, y + 6);
  y += 18;

  const esdContributions = state.esd?.contributions || [];
  if (esdContributions.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Beneficiary", "Type", "Amount (ZAR)", "Category"]],
      body: esdContributions.map((c: any) => [
        c.beneficiary,
        (c.type || '').replace(/_/g, ' '),
        formatCurrency(c.amount),
        (c.category || '').replace(/_/g, ' ')
      ]),
      theme: 'grid',
      headStyles: { fillColor: ROSE, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [220, 200, 200] },
      alternateRowStyles: { fillColor: ROSE_LIGHT },
      margin: { left: margin, right: margin },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const cat = (data.cell.raw as string).toLowerCase();
          if (cat.includes('supplier')) {
            data.cell.styles.textColor = ROSE;
            data.cell.styles.fontStyle = 'bold';
          } else if (cat.includes('enterprise')) {
            data.cell.styles.textColor = [124, 58, 237];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...SLATE_500);
    doc.text("No ESD contributions recorded.", margin, y + 5);
    y += 20;
  }

  y = addSectionTitle(doc, "Socio-Economic Development", y, margin, SECTION_THEMES.sed);

  doc.setFillColor(...BLUE_LIGHT);
  doc.roundedRect(margin, y - 2, contentWidth, 10, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...BLUE);
  doc.text(`SED Target (1% of NPAT): ${formatCurrency(Math.abs(npat) * 0.01)}    |    Score: ${state.scorecard.socioEconomicDevelopment.score.toFixed(2)} / 5`, margin + 5, y + 5);
  y += 14;

  const sedContributions = state.sed?.contributions || [];
  if (sedContributions.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Beneficiary", "Type", "Amount (ZAR)", "Category"]],
      body: sedContributions.map((c: any) => [
        c.beneficiary,
        (c.type || '').replace(/_/g, ' '),
        formatCurrency(c.amount),
        (c.category || '').replace(/_/g, ' ')
      ]),
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [200, 210, 230] },
      alternateRowStyles: { fillColor: BLUE_LIGHT },
      margin: { left: margin, right: margin },
    });
  }

  doc.addPage();
  addPageHeader(doc, "DISCLAIMER & DECLARATION", SECTION_THEMES.scorecard);

  y = 22;
  y = addSectionTitle(doc, "Disclaimer & Declaration", y, margin, SECTION_THEMES.scorecard);

  doc.setFontSize(10);
  doc.setTextColor(...SLATE_700);
  const disclaimer = [
    "This B-BBEE verification report has been prepared using data provided by the measured entity.",
    "",
    "The information contained herein is based on the Amended Codes of Good Practice (2013),",
    "the B-BBEE Act (No. 53 of 2003), and the B-BBEE Amendment Act (No. 46 of 2013).",
    "",
    "This report is generated by the Okiru.Pro B-BBEE Compliance Intelligence Platform",
    "and does not constitute a formal verification certificate issued by a SANAS-accredited",
    "verification agency. For formal verification, please engage a registered B-BBEE",
    "verification agency.",
    "",
    "The scorecard calculations are based on the Generic Scorecard of the Amended Codes",
    "of Good Practice. Sector-specific scorecards may produce different results.",
  ];

  if (options.includeDraft2026) {
    disclaimer.push(
      "",
      "NOTE: This report includes considerations from the Draft 2026 B-BBEE Code amendments.",
      "These draft provisions are subject to change and should not be relied upon for",
      "formal compliance purposes until gazetted."
    );
  }

  disclaimer.forEach(line => {
    doc.text(line, margin, y);
    y += 6;
  });

  y += 8;
  if (options.reportNotes) {
    doc.setFontSize(12);
    doc.setTextColor(...PURPLE);
    doc.text("Report Notes", margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(...SLATE_700);
    const noteLines = doc.splitTextToSize(options.reportNotes, contentWidth);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 6 + 10;
  }

  doc.setFillColor(...PURPLE_FAINT);
  doc.roundedRect(margin, y, contentWidth, 30, 3, 3, 'F');
  doc.setDrawColor(...PURPLE_LIGHT);
  doc.roundedRect(margin, y, contentWidth, 30, 3, 3, 'S');

  doc.setFontSize(9);
  doc.setTextColor(...PURPLE);
  doc.text("Prepared by:", margin + 5, y + 8);
  doc.setTextColor(...SLATE_900);
  doc.text(options.analystName || "Verification Analyst", margin + 30, y + 8);

  doc.setTextColor(...PURPLE);
  doc.text("Date:", margin + 5, y + 16);
  doc.setTextColor(...SLATE_900);
  doc.text(formatDate(today), margin + 30, y + 16);

  doc.setTextColor(...PURPLE);
  doc.text("Certificate:", margin + 5, y + 24);
  doc.setTextColor(...SLATE_900);
  doc.text(certNumber, margin + 30, y + 24);

  drawSeal(doc, pageWidth - margin - 20, y + 15, currentLevel);

  const totalPages = doc.internal.pages.length - 1;
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages);
  }

  const entityName = state.client.name.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = today.toISOString().split('T')[0];
  const fileName = `BBEE_Certificate_${entityName}_${dateStr}.pdf`;
  doc.save(fileName);
  return fileName;
};

export const exportToPdf = exportCertificatePdf;
