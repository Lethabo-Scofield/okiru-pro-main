import pptxgen from "pptxgenjs";
import { OKIRU_LOGO_BASE64 } from "./logo";

interface ExportOptions {
  analystName?: string;
  reportNotes?: string;
  includeDraft2026?: boolean;
}

function formatCurrency(value: number): string {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(score: number, target: number): number {
  return target > 0 ? Math.min(100, (score / target) * 100) : 0;
}

const C = {
  BLACK: "18181B",
  DARK: "1C1C1E",
  GREY_900: "1D1D1F",
  GREY_800: "2C2C2E",
  GREY_700: "3A3A3C",
  GREY_500: "636366",
  GREY_400: "8E8E93",
  GREY_300: "AEAEB2",
  GREY_200: "D1D1D6",
  GREY_100: "E5E5EA",
  GREY_50: "F2F2F7",
  WHITE: "FFFFFF",
  PURPLE: "6D28D9",
  PURPLE_LIGHT: "8B5CF6",
  PURPLE_FAINT: "F5F0FF",
  PURPLE_BG: "EDE9FE",
  GREEN: "30D158",
  GREEN_DARK: "059669",
  GREEN_BG: "D1FAE5",
  RED: "FF453A",
  RED_BG: "FEECEB",
  ORANGE: "D97706",
  ORANGE_BG: "FEF3C7",
  TEAL: "0D9488",
  TEAL_BG: "CCFBF1",
  BLUE: "2563EB",
  BLUE_BG: "DBEAFE",
  INDIGO: "4F46E5",
  INDIGO_BG: "E0E7FF",
  ROSE: "BE123C",
  ROSE_BG: "FFE4E6",
  AMBER: "D97706",
  YELLOW: "FFD60A",
};

const PILLAR_COLORS: Record<string, string> = {
  ownership: C.INDIGO,
  management: C.TEAL,
  skills: C.GREEN_DARK,
  procurement: C.AMBER,
  esd: C.ROSE,
  sed: C.BLUE,
  yes: C.PURPLE_LIGHT,
};

const PILLAR_BG: Record<string, string> = {
  ownership: C.INDIGO_BG,
  management: C.TEAL_BG,
  skills: C.GREEN_BG,
  procurement: C.ORANGE_BG,
  esd: C.ROSE_BG,
  sed: C.BLUE_BG,
  yes: C.PURPLE_BG,
};

function addMasterFooter(slide: any, entityName: string) {
  slide.addText(entityName, { x: 0.4, y: 5.15, w: 4, h: 0.2, fontSize: 7, color: C.GREY_400, fontFace: "Helvetica Neue" });
  slide.addText("Confidential", { x: 7.5, y: 5.15, w: 2, h: 0.2, fontSize: 7, color: C.GREY_400, fontFace: "Helvetica Neue", align: "right" });
}

function addSectionDivider(pres: pptxgen, title: string, subtitle: string) {
  const s = pres.addSlide();
  s.background = { color: C.GREY_50 };
  s.addText(title, { x: 0.8, y: 2.0, w: 8.4, h: 0.8, fontSize: 36, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  s.addShape(pres.ShapeType.rect, { x: 0.8, y: 2.9, w: 2, h: 0.04, fill: { color: C.PURPLE } });
  s.addText(subtitle, { x: 0.8, y: 3.2, w: 8, h: 0.5, fontSize: 14, color: C.GREY_500, fontFace: "Helvetica Neue" });
  return s;
}

function addStatCard(slide: any, pres: pptxgen, x: number, y: number, w: number, h: number, label: string, value: string, accent: string, subtitle?: string) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: C.WHITE }, rectRadius: 0.12, shadow: { type: "outer", blur: 8, offset: 2, color: "000000", opacity: 0.06 } });
  slide.addShape(pres.ShapeType.rect, { x: x + 0.02, y, w: 0.06, h, fill: { color: accent }, rectRadius: 0 });
  slide.addText(label, { x: x + 0.25, y: y + 0.15, w: w - 0.4, h: 0.22, fontSize: 9, color: C.GREY_500, fontFace: "Helvetica Neue", bold: true });
  slide.addText(value, { x: x + 0.25, y: y + 0.4, w: w - 0.4, h: 0.5, fontSize: 28, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  if (subtitle) {
    slide.addText(subtitle, { x: x + 0.25, y: y + h - 0.35, w: w - 0.4, h: 0.22, fontSize: 9, color: C.GREY_400, fontFace: "Helvetica Neue" });
  }
}

function addProgressBar(slide: any, pres: pptxgen, x: number, y: number, w: number, pctVal: number, color: string) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h: 0.1, fill: { color: C.GREY_100 }, rectRadius: 0.05 });
  if (pctVal > 0) {
    slide.addShape(pres.ShapeType.roundRect, { x, y, w: Math.max(0.1, w * Math.min(1, pctVal / 100)), h: 0.1, fill: { color }, rectRadius: 0.05 });
  }
}

export const exportStrategyPptx = async (state: any, options: ExportOptions = {}) => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = options.analystName || "Okiru.Pro";
  pres.company = state.client.name;
  pres.subject = "B-BBEE Strategy & Scorecard Report";

  const today = new Date();
  const dateFormatted = today.toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
  const currentLevelNum = state.scorecard.isDiscounted ? state.scorecard.discountedLevel : state.scorecard.achievedLevel;
  const currentLevel = currentLevelNum >= 9 ? 'Non-Compliant' : `Level ${currentLevelNum}`;
  const entityName = state.client.name;

  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.WHITE },
    objects: [
      { rect: { x: 0, y: 5.1, w: "100%", h: 0.04, fill: { color: C.GREY_100 } } },
    ]
  });

  const s1 = pres.addSlide();
  s1.background = { color: C.DARK };

  s1.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: C.DARK } });
  s1.addShape(pres.ShapeType.rect, { x: 6, y: 0, w: 4, h: "100%", fill: { color: "1E1040" } });
  s1.addShape(pres.ShapeType.rect, { x: 0, y: 4.85, w: 6, h: 0.04, fill: { color: C.PURPLE } });

  try {
    s1.addImage({ data: OKIRU_LOGO_BASE64, x: 0.8, y: 0.5, w: 2.2, h: 0.55 });
  } catch {
    s1.addText("OKIRU.PRO", { x: 0.8, y: 0.5, w: 3, h: 0.5, fontSize: 16, color: C.PURPLE, fontFace: "Helvetica Neue", bold: true });
  }

  s1.addText("B-BBEE Strategy &\nScorecard Report", { x: 0.8, y: 1.6, w: 5, h: 1.4, fontSize: 38, color: C.WHITE, fontFace: "Helvetica Neue", bold: true, lineSpacing: 46 });
  s1.addText(entityName, { x: 0.8, y: 3.3, w: 5, h: 0.5, fontSize: 20, color: C.PURPLE_LIGHT, fontFace: "Helvetica Neue" });
  s1.addText(`Financial Year ${state.client.financialYear}`, { x: 0.8, y: 3.85, w: 5, h: 0.35, fontSize: 13, color: C.GREY_400, fontFace: "Helvetica Neue" });

  s1.addText(currentLevel, { x: 6.4, y: 1.2, w: 3.2, h: 0.8, fontSize: 32, bold: true, color: C.PURPLE_LIGHT, fontFace: "Helvetica Neue", align: "center" });
  s1.addText("Current Level", { x: 6.4, y: 2.0, w: 3.2, h: 0.3, fontSize: 11, color: C.GREY_400, fontFace: "Helvetica Neue", align: "center" });
  s1.addText(`${state.scorecard.total.score.toFixed(1)}`, { x: 6.4, y: 2.8, w: 3.2, h: 0.7, fontSize: 36, bold: true, color: C.WHITE, fontFace: "Helvetica Neue", align: "center" });
  s1.addText("Total Points", { x: 6.4, y: 3.5, w: 3.2, h: 0.3, fontSize: 11, color: C.GREY_400, fontFace: "Helvetica Neue", align: "center" });
  s1.addText(state.scorecard.recognitionLevel, { x: 6.4, y: 4.1, w: 3.2, h: 0.3, fontSize: 13, color: C.GREY_300, fontFace: "Helvetica Neue", align: "center" });

  s1.addText(`Prepared by ${options.analystName || 'Okiru.Pro'}  \u2022  ${dateFormatted}`, { x: 0.8, y: 5.0, w: 5, h: 0.3, fontSize: 9, color: C.GREY_500, fontFace: "Helvetica Neue" });

  const s2 = pres.addSlide({ masterName: "CONTENT" });
  s2.addText("Executive Summary", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  s2.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.PURPLE } });
  addMasterFooter(s2, entityName);

  const levelColor = currentLevelNum <= 2 ? C.GREEN_DARK : currentLevelNum <= 4 ? C.PURPLE : currentLevelNum <= 6 ? C.ORANGE : C.RED;

  addStatCard(s2, pres, 0.6, 1.2, 2.7, 1.3, "B-BBEE LEVEL", currentLevel, levelColor, state.scorecard.recognitionLevel);
  addStatCard(s2, pres, 3.55, 1.2, 2.7, 1.3, "TOTAL SCORE", `${state.scorecard.total.score.toFixed(1)} / 127`, C.PURPLE, `${pct(state.scorecard.total.score, 127).toFixed(0)}% achievement`);
  addStatCard(s2, pres, 6.5, 1.2, 3, 1.3, "SUB-MINIMUM", state.scorecard.isDiscounted ? "Failed" : "All Passed", state.scorecard.isDiscounted ? C.RED : C.GREEN_DARK, state.scorecard.isDiscounted ? "Level discounted by 1" : "No discounting applied");

  s2.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 2.8, w: 8.8, h: 1.8, fill: { color: C.GREY_50 }, rectRadius: 0.12 });
  s2.addText("Entity Overview", { x: 0.9, y: 2.95, w: 4, h: 0.25, fontSize: 10, bold: true, color: C.GREY_500, fontFace: "Helvetica Neue" });

  const entityDetails = [
    ["Entity", entityName],
    ["Revenue", formatCurrency(state.client.revenue)],
    ["NPAT", formatCurrency(state.client.npat)],
    ["Financial Year", state.client.financialYear],
    ["Industry", state.client.industrySector?.substring(0, 50) || "Generic"],
    ["Leviable Amount", formatCurrency(state.client.leviableAmount || 0)],
  ];

  entityDetails.forEach(([label, val], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const xPos = 0.9 + col * 4.4;
    const yPos = 3.35 + row * 0.35;
    s2.addText(`${label}:`, { x: xPos, y: yPos, w: 1.6, h: 0.25, fontSize: 9, color: C.GREY_400, fontFace: "Helvetica Neue" });
    s2.addText(val as string, { x: xPos + 1.6, y: yPos, w: 2.5, h: 0.25, fontSize: 9, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  });

  const s3 = pres.addSlide({ masterName: "CONTENT" });
  s3.addText("Scorecard Breakdown", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  s3.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.PURPLE } });
  addMasterFooter(s3, entityName);

  const elements = [
    { key: "ownership", name: "Ownership", score: state.scorecard.ownership.score, target: 25, subMin: state.scorecard.ownership.subMinimumMet },
    { key: "management", name: "Management Control", score: state.scorecard.managementControl.score, target: 27, subMin: null },
    { key: "skills", name: "Skills Development", score: state.scorecard.skillsDevelopment.score, target: 25, subMin: state.scorecard.skillsDevelopment.subMinimumMet },
    { key: "procurement", name: "Preferential Procurement", score: state.scorecard.procurement.score, target: 25, subMin: state.scorecard.procurement.subMinimumMet },
    { key: "esd", name: "Enterprise & Supplier Dev", score: state.scorecard.enterpriseDevelopment.score, target: 15, subMin: null },
    { key: "sed", name: "Socio-Economic Dev", score: state.scorecard.socioEconomicDevelopment.score, target: 5, subMin: null },
    { key: "yes", name: "YES Initiative", score: state.scorecard.yesInitiative?.score || 0, target: 5, subMin: null },
  ];

  const tableRows: pptxgen.TableRow[] = [
    [
      { text: "Element", options: { bold: true, fill: { color: C.PURPLE }, color: C.WHITE, fontSize: 9, fontFace: "Helvetica Neue", margin: [4, 8, 4, 8] } },
      { text: "Score", options: { bold: true, fill: { color: C.PURPLE }, color: C.WHITE, fontSize: 9, fontFace: "Helvetica Neue", align: "center" } },
      { text: "Target", options: { bold: true, fill: { color: C.PURPLE }, color: C.WHITE, fontSize: 9, fontFace: "Helvetica Neue", align: "center" } },
      { text: "Achievement", options: { bold: true, fill: { color: C.PURPLE }, color: C.WHITE, fontSize: 9, fontFace: "Helvetica Neue", align: "center" } },
      { text: "Sub-min", options: { bold: true, fill: { color: C.PURPLE }, color: C.WHITE, fontSize: 9, fontFace: "Helvetica Neue", align: "center" } },
    ],
  ];

  elements.forEach((el, i) => {
    const p = pct(el.score, el.target);
    const pillarColor = PILLAR_COLORS[el.key] || C.GREY_900;
    const fillColor = i % 2 === 0 ? C.GREY_50 : C.WHITE;
    const scoreColor = p >= 80 ? C.GREEN_DARK : p >= 50 ? C.ORANGE : C.RED;
    tableRows.push([
      { text: el.name, options: { fill: { color: fillColor }, fontSize: 9, fontFace: "Helvetica Neue", color: pillarColor, margin: [4, 8, 4, 8], bold: true } },
      { text: el.score.toFixed(2), options: { fill: { color: fillColor }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", bold: true, color: scoreColor } },
      { text: el.target.toString(), options: { fill: { color: fillColor }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", color: C.GREY_500 } },
      { text: `${p.toFixed(0)}%`, options: { fill: { color: fillColor }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", bold: true, color: scoreColor } },
      { text: el.subMin === null ? "\u2014" : el.subMin ? "\u2713 Met" : "\u2717 Not Met", options: { fill: { color: fillColor }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", color: el.subMin === false ? C.RED : el.subMin === true ? C.GREEN_DARK : C.GREY_400 } },
    ]);
  });

  tableRows.push([
    { text: "TOTAL", options: { bold: true, fill: { color: C.PURPLE }, fontSize: 9, fontFace: "Helvetica Neue", color: C.WHITE, margin: [4, 8, 4, 8] } },
    { text: state.scorecard.total.score.toFixed(2), options: { bold: true, fill: { color: C.PURPLE }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", color: C.WHITE } },
    { text: "127", options: { bold: true, fill: { color: C.PURPLE }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", color: C.GREY_300 } },
    { text: `${pct(state.scorecard.total.score, 127).toFixed(0)}%`, options: { bold: true, fill: { color: C.PURPLE }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", color: C.WHITE } },
    { text: state.scorecard.isDiscounted ? "DISCOUNTED" : "ALL PASSED", options: { bold: true, fill: { color: C.PURPLE }, fontSize: 9, fontFace: "Helvetica Neue", align: "center", color: state.scorecard.isDiscounted ? C.RED : C.GREEN } },
  ]);

  s3.addTable(tableRows, { x: 0.6, y: 1.1, w: 8.8, rowH: 0.38, border: { type: "solid", color: C.GREY_200, pt: 0.3 } });

  const s4 = pres.addSlide({ masterName: "CONTENT" });
  s4.addText("Pillar Performance", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  s4.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.PURPLE } });
  addMasterFooter(s4, entityName);

  elements.slice(0, 6).forEach((el, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.6 + col * 3.1;
    const y = 1.15 + row * 2.0;
    const color = PILLAR_COLORS[el.key] || C.GREY_900;
    const bgColor = PILLAR_BG[el.key] || C.GREY_50;

    s4.addShape(pres.ShapeType.roundRect, { x, y, w: 2.8, h: 1.75, fill: { color: C.WHITE }, rectRadius: 0.1, shadow: { type: "outer", blur: 6, offset: 1, color: "000000", opacity: 0.04 } });

    s4.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: y + 0.2, w: 0.35, h: 0.35, fill: { color: bgColor } });
    s4.addText("\u25CF", { x: x + 0.23, y: y + 0.18, w: 0.3, h: 0.35, fontSize: 12, color, fontFace: "Helvetica Neue", align: "center" });

    s4.addText(el.name, { x: x + 0.65, y: y + 0.2, w: 1.95, h: 0.3, fontSize: 10, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });

    s4.addText(`${el.score.toFixed(1)}`, { x: x + 0.2, y: y + 0.7, w: 1, h: 0.4, fontSize: 24, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
    s4.addText(`/ ${el.target}`, { x: x + 1.15, y: y + 0.8, w: 0.7, h: 0.25, fontSize: 11, color: C.GREY_400, fontFace: "Helvetica Neue" });

    const p = pct(el.score, el.target);
    s4.addText(`${p.toFixed(0)}%`, { x: x + 2.0, y: y + 0.7, w: 0.6, h: 0.35, fontSize: 13, bold: true, color: p >= 80 ? C.GREEN_DARK : p >= 50 ? C.ORANGE : C.RED, fontFace: "Helvetica Neue", align: "right" });

    addProgressBar(s4, pres, x + 0.2, y + 1.25, 2.4, p, color);

    if (el.subMin === false) {
      s4.addText("Sub-min not met", { x: x + 0.2, y: y + 1.45, w: 2.4, h: 0.2, fontSize: 7, color: C.RED, fontFace: "Helvetica Neue", bold: true });
    }
  });

  addSectionDivider(pres, "Pillar Deep Dive", "Detailed analysis of each B-BBEE element with actionable recommendations.");

  const pillarSlides = [
    {
      title: "Ownership",
      key: "ownership",
      score: state.scorecard.ownership.score,
      target: 25,
      details: [
        ["Company Value", formatCurrency(state.ownership?.companyValue || 0)],
        ["Outstanding Debt", formatCurrency(state.ownership?.outstandingDebt || 0)],
        ["Net Value", formatCurrency((state.ownership?.companyValue || 0) - (state.ownership?.outstandingDebt || 0))],
        ["Shareholders", `${state.ownership?.shareholders?.length || 0}`],
        ["Sub-minimum", state.scorecard.ownership.subMinimumMet ? "Met (\u226540%)" : "Not Met (<40%)"],
      ],
      recommendation: state.scorecard.ownership.score < 15 ? "Consider increasing black shareholding through share schemes, broad-based trusts, or new equity partners." : "Ownership performance is solid. Focus on maintaining or improving economic interest recognition.",
    },
    {
      title: "Management Control",
      key: "management",
      score: state.scorecard.managementControl.score,
      target: 27,
      details: [
        ["Total Employees", `${state.management?.employees?.length || 0}`],
        ["Board Members", `${(state.management?.employees || []).filter((e: any) => e.designation === 'Board').length}`],
        ["Executive Directors", `${(state.management?.employees || []).filter((e: any) => e.designation === 'Executive Director').length}`],
        ["Other Executive Mgmt", `${(state.management?.employees || []).filter((e: any) => e.designation === 'Other Executive Management').length}`],
        ["Black Employees", `${(state.management?.employees || []).filter((e: any) => ['African','Coloured','Indian'].includes(e.race)).length}`],
        ["Black Women", `${(state.management?.employees || []).filter((e: any) => ['African','Coloured','Indian'].includes(e.race) && e.gender === 'Female').length}`],
      ],
      recommendation: state.scorecard.managementControl.score < 15 ? "Prioritise appointments of black individuals at executive and senior management levels. Consider mentorship programmes for middle management pipeline." : "Management representation is progressing well. Continue succession planning and mentoring programmes.",
    },
    {
      title: "Skills Development",
      key: "skills",
      score: state.scorecard.skillsDevelopment.score,
      target: 25,
      details: [
        ["Leviable Amount", formatCurrency(state.skills?.leviableAmount || 0)],
        ["Target Spend (3.5%)", formatCurrency((state.skills?.leviableAmount || 0) * 0.035)],
        ["Actual Spend", formatCurrency((state.skills?.trainingPrograms || []).reduce((s: number, p: any) => s + p.cost, 0))],
        ["Training Programs", `${state.skills?.trainingPrograms?.length || 0}`],
        ["Sub-minimum", state.scorecard.skillsDevelopment.subMinimumMet ? "Met (\u226540%)" : "Not Met (<40%)"],
      ],
      recommendation: state.scorecard.skillsDevelopment.score < 15 ? "Invest in accredited learnerships, bursaries and workplace skills plans targeting black employees. Ensure spend is properly documented." : "Skills spend is on track. Ensure training is accredited and properly recorded.",
    },
    {
      title: "Preferential Procurement",
      key: "procurement",
      score: state.scorecard.procurement.score,
      target: 25,
      details: [
        ["TMPS", formatCurrency(state.procurement?.tmps || 0)],
        ["Total Suppliers", `${state.procurement?.suppliers?.length || 0}`],
        ["Total Spend", formatCurrency((state.procurement?.suppliers || []).reduce((s: number, sup: any) => s + sup.spend, 0))],
        ["Designated Group Bonus", "Max 2 pts (51%+ BO suppliers)"],
        ["Sub-minimum", state.scorecard.procurement.subMinimumMet ? "Met (base \u226511.6 pts)" : "Not Met (base <11.6 pts)"],
      ],
      recommendation: state.scorecard.procurement.score < 17 ? "Source from Level 1-2 B-BBEE suppliers, prioritise >51% black-owned and black women-owned vendors." : "Procurement strategy is effective. Maintain supplier diversity initiatives.",
    },
    {
      title: "Enterprise & Supplier Development",
      key: "esd",
      score: state.scorecard.enterpriseDevelopment.score,
      target: 15,
      details: [
        ["NPAT", formatCurrency(state.client.npat)],
        ["SD Target (2% NPAT)", formatCurrency(Math.abs(state.client.npat) * 0.02)],
        ["ED Target (1% NPAT)", formatCurrency(Math.abs(state.client.npat) * 0.01)],
        ["Total Contributions", `${state.esd?.contributions?.length || 0}`],
        ["Total Amount", formatCurrency((state.esd?.contributions || []).reduce((s: number, c: any) => s + c.amount, 0))],
      ],
      recommendation: state.scorecard.enterpriseDevelopment.score < 8 ? "Increase ESD contributions through interest-free loans, mentorship programmes, and direct investment in qualifying enterprises." : "ESD contributions are on track. Ensure beneficiaries are >51% black-owned EMEs/QSEs.",
    },
    {
      title: "Socio-Economic Development",
      key: "sed",
      score: state.scorecard.socioEconomicDevelopment.score,
      target: 5,
      details: [
        ["SED Target (1% NPAT)", formatCurrency(Math.abs(state.client.npat) * 0.01)],
        ["Total Contributions", `${state.sed?.contributions?.length || 0}`],
        ["Total Amount", formatCurrency((state.sed?.contributions || []).reduce((s: number, c: any) => s + c.amount, 0))],
      ],
      recommendation: state.scorecard.socioEconomicDevelopment.score < 3 ? "Direct SED spend to education, healthcare, or infrastructure projects benefiting black communities." : "SED contributions are meeting targets. Document beneficiary impact for verification.",
    },
  ];

  pillarSlides.forEach((pillar) => {
    const slide = pres.addSlide({ masterName: "CONTENT" });
    const p = pct(pillar.score, pillar.target);
    const color = PILLAR_COLORS[pillar.key] || C.GREY_900;
    const bgColor = PILLAR_BG[pillar.key] || C.GREY_50;
    addMasterFooter(slide, entityName);

    slide.addShape(pres.ShapeType.ellipse, { x: 0.5, y: 0.2, w: 0.45, h: 0.45, fill: { color: bgColor } });
    slide.addText("\u25CF", { x: 0.53, y: 0.18, w: 0.4, h: 0.45, fontSize: 14, color, fontFace: "Helvetica Neue", align: "center" });
    slide.addText(pillar.title, { x: 1.1, y: 0.25, w: 5, h: 0.4, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });

    slide.addShape(pres.ShapeType.roundRect, { x: 7.2, y: 0.15, w: 2.4, h: 0.55, fill: { color: p >= 80 ? C.GREEN_BG : p >= 50 ? C.ORANGE_BG : C.RED_BG }, rectRadius: 0.1 });
    slide.addText(`${pillar.score.toFixed(1)} / ${pillar.target}  \u2022  ${p.toFixed(0)}%`, { x: 7.3, y: 0.2, w: 2.2, h: 0.45, fontSize: 12, bold: true, color: p >= 80 ? C.GREEN_DARK : p >= 50 ? C.ORANGE : C.RED, fontFace: "Helvetica Neue", align: "center" });

    addProgressBar(slide, pres, 0.6, 0.85, 8.8, p, color);

    slide.addText("Key Metrics", { x: 0.6, y: 1.15, w: 3, h: 0.25, fontSize: 10, bold: true, color: C.GREY_500, fontFace: "Helvetica Neue" });

    pillar.details.forEach(([label, val], i) => {
      const y = 1.55 + i * 0.42;
      slide.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 8.8, h: 0.35, fill: { color: i % 2 === 0 ? C.GREY_50 : C.WHITE }, rectRadius: 0.05 });
      slide.addText(label, { x: 0.8, y, w: 3.5, h: 0.35, fontSize: 10, color: C.GREY_500, fontFace: "Helvetica Neue" });
      slide.addText(val, { x: 4.5, y, w: 4.7, h: 0.35, fontSize: 10, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue", align: "right" });
    });

    const recY = 1.55 + pillar.details.length * 0.42 + 0.3;
    slide.addShape(pres.ShapeType.roundRect, { x: 0.6, y: recY, w: 8.8, h: 0.8, fill: { color: C.PURPLE_BG }, rectRadius: 0.1 });
    slide.addText("Recommendation", { x: 0.85, y: recY + 0.08, w: 8, h: 0.22, fontSize: 9, bold: true, color: C.PURPLE, fontFace: "Helvetica Neue" });
    slide.addText(pillar.recommendation, { x: 0.85, y: recY + 0.32, w: 8.3, h: 0.4, fontSize: 10, color: C.GREY_700, fontFace: "Helvetica Neue" });
  });

  const gapSlide = pres.addSlide({ masterName: "CONTENT" });
  gapSlide.addText("Gaps Analysis", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  gapSlide.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.PURPLE } });
  gapSlide.addText("Points gap to maximum achievable score per pillar", { x: 0.6, y: 0.95, w: 8, h: 0.3, fontSize: 10, color: C.GREY_400, fontFace: "Helvetica Neue" });
  addMasterFooter(gapSlide, entityName);

  elements.slice(0, 6).forEach((el, i) => {
    const gap = el.target - el.score;
    const p = pct(el.score, el.target);
    const y = 1.5 + i * 0.58;
    const color = PILLAR_COLORS[el.key] || C.GREY_900;

    gapSlide.addText(el.name, { x: 0.6, y, w: 2.8, h: 0.3, fontSize: 10, color: PILLAR_COLORS[el.key] || C.GREY_900, fontFace: "Helvetica Neue", bold: true });
    addProgressBar(gapSlide, pres, 3.5, y + 0.12, 4.2, p, color);
    gapSlide.addText(`${el.score.toFixed(1)} / ${el.target}`, { x: 7.9, y, w: 1, h: 0.3, fontSize: 10, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue", align: "right" });
    if (gap > 0.5) {
      gapSlide.addText(`\u2212${gap.toFixed(1)} gap`, { x: 7.9, y: y + 0.25, w: 1, h: 0.2, fontSize: 8, color: C.RED, fontFace: "Helvetica Neue", align: "right" });
    }
  });

  const scenarios = state.scenarios || [];
  if (scenarios.length > 0) {
    const scenSlide = pres.addSlide({ masterName: "CONTENT" });
    scenSlide.addText("What-If Scenarios", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
    scenSlide.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.PURPLE } });
    scenSlide.addText("Explore how changes to individual pillars affect your overall B-BBEE level.", { x: 0.6, y: 0.95, w: 8, h: 0.3, fontSize: 10, color: C.GREY_400, fontFace: "Helvetica Neue" });
    addMasterFooter(scenSlide, entityName);

    scenarios.slice(0, 5).forEach((sc: any, i: number) => {
      const y = 1.5 + i * 0.65;
      scenSlide.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 8.8, h: 0.5, fill: { color: C.GREY_50 }, rectRadius: 0.08 });
      scenSlide.addText(sc.name, { x: 0.85, y: y + 0.05, w: 5, h: 0.4, fontSize: 11, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
      scenSlide.addText(new Date(sc.createdAt).toLocaleDateString('en-ZA'), { x: 6.5, y: y + 0.05, w: 2.7, h: 0.4, fontSize: 10, color: C.GREY_400, fontFace: "Helvetica Neue", align: "right" });
    });
  }

  if (options.includeDraft2026) {
    const draftSlide = pres.addSlide({ masterName: "CONTENT" });
    draftSlide.addText("Draft 2026 Amendments", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
    draftSlide.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.ORANGE } });
    addMasterFooter(draftSlide, entityName);

    const draftPoints = [
      "Potential introduction of Transformation Fund contributions",
      "Revised targets for Skills Development spend thresholds",
      "Enhanced YES Initiative weighting and recognition",
      "Updated EAP demographic targets based on latest census data",
      "Possible adjustments to sub-minimum thresholds",
      "Enhanced reporting requirements for verification agencies",
    ];

    draftPoints.forEach((point, i) => {
      const y = 1.2 + i * 0.5;
      draftSlide.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 8.8, h: 0.4, fill: { color: i % 2 === 0 ? C.GREY_50 : C.WHITE }, rectRadius: 0.05 });
      draftSlide.addText(`${i + 1}.  ${point}`, { x: 0.85, y, w: 8.3, h: 0.4, fontSize: 11, color: C.GREY_900, fontFace: "Helvetica Neue" });
    });

    draftSlide.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 4.3, w: 8.8, h: 0.55, fill: { color: C.ORANGE_BG }, rectRadius: 0.08 });
    draftSlide.addText("These draft provisions are subject to change and should not be relied upon until formally gazetted.", { x: 0.85, y: 4.35, w: 8.3, h: 0.45, fontSize: 9, color: C.ORANGE, fontFace: "Helvetica Neue" });
  }

  const nextSlide = pres.addSlide({ masterName: "CONTENT" });
  nextSlide.addText("Next Steps", { x: 0.6, y: 0.3, w: 6, h: 0.5, fontSize: 22, bold: true, color: C.GREY_900, fontFace: "Helvetica Neue" });
  nextSlide.addShape(pres.ShapeType.rect, { x: 0.6, y: 0.85, w: 1.5, h: 0.03, fill: { color: C.PURPLE } });
  addMasterFooter(nextSlide, entityName);

  const actions: Array<{ text: string; priority: boolean }> = [];
  if (!state.scorecard.ownership.subMinimumMet) actions.push({ text: "Address Ownership sub-minimum failure to avoid level discounting", priority: true });
  if (!state.scorecard.skillsDevelopment.subMinimumMet) actions.push({ text: "Increase Skills Development to meet 40% sub-minimum threshold", priority: true });
  if (!state.scorecard.procurement.subMinimumMet) actions.push({ text: "Improve Preferential Procurement base score to meet 40% sub-minimum threshold (\u226511.6 pts)", priority: true });
  if (state.scorecard.managementControl.score < 15) actions.push({ text: "Appoint black individuals at executive and senior management levels", priority: false });
  if (state.scorecard.enterpriseDevelopment.score < 8) actions.push({ text: "Increase ESD contributions to meet NPAT-based targets", priority: false });
  if (state.scorecard.socioEconomicDevelopment.score < 3) actions.push({ text: "Identify community projects for SED contributions", priority: false });
  actions.push({ text: "Schedule formal B-BBEE verification with SANAS-accredited agency", priority: false });
  actions.push({ text: "Review and update data quarterly to maintain scorecard accuracy", priority: false });

  actions.slice(0, 8).forEach((action, i) => {
    const y = 1.15 + i * 0.5;
    const bgColor = action.priority ? C.RED_BG : C.GREY_50;
    nextSlide.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 8.8, h: 0.42, fill: { color: bgColor }, rectRadius: 0.06 });
    const marker = action.priority ? "\u26A1" : `${i + 1}.`;
    nextSlide.addText(`${marker}  ${action.text}`, { x: 0.85, y, w: 8.3, h: 0.42, fontSize: 10, color: action.priority ? C.RED : C.GREY_900, fontFace: "Helvetica Neue", bold: action.priority });
  });

  const closeSlide = pres.addSlide();
  closeSlide.background = { color: C.DARK };

  try {
    closeSlide.addImage({ data: OKIRU_LOGO_BASE64, x: 3.5, y: 1.5, w: 3, h: 0.75 });
  } catch {
    closeSlide.addText("OKIRU.PRO", { x: 3, y: 1.5, w: 4, h: 0.6, fontSize: 24, color: C.PURPLE, fontFace: "Helvetica Neue", bold: true, align: "center" });
  }

  closeSlide.addText("Thank You", { x: 2, y: 2.5, w: 6, h: 0.6, fontSize: 32, bold: true, color: C.WHITE, fontFace: "Helvetica Neue", align: "center" });
  closeSlide.addShape(pres.ShapeType.rect, { x: 4.3, y: 3.2, w: 1.4, h: 0.03, fill: { color: C.PURPLE } });
  closeSlide.addText("B-BBEE Compliance Intelligence Platform", { x: 2, y: 3.5, w: 6, h: 0.35, fontSize: 12, color: C.GREY_400, fontFace: "Helvetica Neue", align: "center" });

  if (options.reportNotes) {
    closeSlide.addShape(pres.ShapeType.roundRect, { x: 1.5, y: 4.0, w: 7, h: 0.7, fill: { color: "1E1040" }, rectRadius: 0.08 });
    closeSlide.addText(`Notes: ${options.reportNotes}`, { x: 1.7, y: 4.05, w: 6.6, h: 0.6, fontSize: 9, color: C.GREY_400, fontFace: "Helvetica Neue" });
  }

  closeSlide.addText("This report does not constitute a formal verification certificate. For formal verification, engage a SANAS-accredited agency.", { x: 1, y: 4.9, w: 8, h: 0.3, fontSize: 8, color: C.GREY_500, fontFace: "Helvetica Neue", align: "center" });

  const dateStr = today.toISOString().split('T')[0];
  const safeEntityName = entityName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Strategy_Pack_${safeEntityName}_${dateStr}`;
  await pres.writeFile({ fileName: fileName + ".pptx" });
  return fileName + ".pptx";
};

export const exportToPptx = exportStrategyPptx;
