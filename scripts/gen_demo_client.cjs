/**
 * Generate a FICTIONAL demo client's B-BBEE gathering workbook for the upload
 * tutorial. Company, people, and numbers are entirely invented (any resemblance
 * to a real entity is coincidental). RCOGP (generic codes), QSE. Designed to
 * ingest cleanly and score well (Level 1–2) for a smooth demo.
 *
 *   node scripts/gen_demo_client.cjs
 */
const XLSX = require("C:/Users/Administrator/Documents/GitHub/okiru-pro-main/node_modules/xlsx");

const OUT = "C:/Users/Administrator/Documents/GitHub/okiru-pro-main/docs/Demo - Kagiso Facilities Services (RCOGP)/Kagiso Facilities - BEE Information Gathering FY2025.xlsx";

const wb = XLSX.utils.book_new();
const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);

// --- Finance ---------------------------------------------------------------
add("Finance", [
  ["Measured Entity:", "Kagiso Facilities Services (Pty) Ltd"],
  ["Registration Number:", "2019/456789/07"],
  ["Financial Year End:", "28 February 2025"],
  [],
  ["Item", "Amount (ZAR)"],
  ["Revenue / Turnover", 24000000],
  ["Net Profit After Tax (NPAT)", 1850000],
  ["Leviable Amount (payroll)", 6200000],
  ["Total Measured Procurement Spend (TMPS)", 15400000],
]);

// --- Ownership -------------------------------------------------------------
add("Ownership", [
  ["Shareholder Name", "Race", "Gender", "ID Number", "Voting Rights %", "Economic Interest %", "Number of Shares"],
  ["Thabo Molefe", "African", "Male", "8203155012088", 60, 60, 600],
  ["Naledi Khumalo", "African", "Female", "8807120145087", 40, 40, 400],
]);

// --- Management Control (also feeds Employment Equity) ----------------------
add("Management Control", [
  ["Employee Name", "Race", "Gender", "Occupational Level", "ID Number", "Foreign"],
  ["Thabo Molefe", "African", "Male", "Executive Director", "8203155012088", "No"],
  ["Naledi Khumalo", "African", "Female", "Executive Director", "8807120145087", "No"],
  ["Sipho Dlamini", "African", "Male", "Senior Management", "8501015800086", "No"],
  ["Zanele Nkosi", "African", "Female", "Senior Management", "8909120800087", "No"],
  ["Fatima Patel", "Indian", "Female", "Middle Management", "9004120088081", "No"],
  ["Johan van Wyk", "White", "Male", "Middle Management", "7806155080083", "No"],
  ["Lindiwe Mahlangu", "African", "Female", "Junior Management", "9203120099088", "No"],
  ["Bongani Zulu", "African", "Male", "Junior Management", "9106015099081", "No"],
  ["Precious Sithole", "African", "Female", "Semi-skilled", "9407120077082", "No"],
  ["Kagiso Moloi", "African", "Male", "Semi-skilled", "9302015066083", "No"],
  ["Amahle Ndlovu", "African", "Female", "Unskilled", "9807120055084", "No"],
  ["Themba Khoza", "African", "Male", "Unskilled", "9601015044085", "No"],
]);

// --- Skills Development -----------------------------------------------------
add("Skills Development", [
  ["Learner Name", "Race", "Gender", "Category Code", "Total Cost", "Programme"],
  ["Lindiwe Mahlangu", "African", "Female", "C", 42000, "Supervisory learnership"],
  ["Bongani Zulu", "African", "Male", "C", 42000, "Supervisory learnership"],
  ["Precious Sithole", "African", "Female", "D", 18000, "Health & Safety short course"],
  ["Kagiso Moloi", "African", "Male", "B", 55000, "NQF4 Business Admin"],
  ["Amahle Ndlovu", "African", "Female", "E", 12000, "Adult basic education"],
]);

// --- Procurement (Preferential Procurement suppliers) ----------------------
add("Procurement", [
  ["Supplier Name", "Claimed Spend Ex VAT", "BEE Level", "Supplier Classification", "Certificate Expiry Date"],
  ["Sizwe Cleaning Supplies", 3200000, 1, "QSE", "2025-11-30"],
  ["Ubuntu Security Services", 2800000, 1, "Generic", "2026-01-31"],
  ["Motheo Uniforms & PPE", 1900000, 2, "QSE", "2025-09-30"],
  ["Bright Spark Electrical", 1600000, 2, "EME", "2026-02-28"],
  ["Green Leaf Landscaping", 1200000, 1, "EME", "2025-12-31"],
  ["Peak Office Consumables", 1450000, 4, "Generic", "2025-10-31"],
  ["Reliable Waste Removal", 900000, 3, "QSE", "2026-03-31"],
  ["Metro Fleet Maintenance", 800000, 4, "Generic", "2025-08-31"],
]);

// --- Enterprise Development -------------------------------------------------
add("Enterprise Development", [
  ["Beneficiary Name", "Contribution Value", "Contribution Type", "Black Ownership %", "Date", "Description"],
  ["Lerato Startup Cleaning Co-op", 40000, "Grant", 100, "2024-08-15", "Cash grant to black-owned EME supplier"],
]);

// --- Social Development (Socio-Economic Development) ------------------------
add("Social Development", [
  ["Beneficiary Name", "Contribution Value", "Contribution Type", "Black Beneficiary %", "Date", "Description"],
  ["Tembisa Primary School", 15000, "Grant", 100, "2024-09-10", "School supplies & feeding scheme"],
  ["Soweto Youth Skills Centre", 12000, "Grant", 100, "2024-11-20", "Computer literacy programme"],
]);

XLSX.writeFile(wb, OUT);
console.log("WROTE:", OUT);
console.log("Sheets:", wb.SheetNames.join(", "));
