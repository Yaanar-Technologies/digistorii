import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

export interface TestCaseResult {
  testId: string;
  module: string;
  description: string;
  targetUrl: string;
  inputData: string;
  expectedResult: string;
  actualResult: string;
  status: "PASS" | "FAIL";
}

export interface TestSummary {
  executionDate: string; // DD-MM-YYYY
  targetEnvironment: string;
  tenantTested: string;
  totalTestCases: number;
  passed: number;
  failed: number;
  passRate: string; // e.g., "90.0%"
}

export async function generateExcelReport(
  results: TestCaseResult[],
  summary: TestSummary,
  outputPath?: string
): Promise<string> {
  const filePath =
    outputPath ||
    path.join(process.cwd(), "tests", "e2e-staging", "DigiStorii_Functional_Test_Report.xlsx");

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigiStorii QA Automation Lead";
  workbook.created = new Date();

  // ==========================================
  // SHEET 1: Summary
  // ==========================================
  const summarySheet = workbook.addWorksheet("Summary", {
    views: [{ showGridLines: true }],
  });

  // Summary title
  summarySheet.mergeCells("A1:D1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = "DIGISTORII FUNCTIONAL E2E TEST SUMMARY REPORT";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E40AF" }, // Sapphire #1E40AF
  };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  summarySheet.getRow(1).height = 40;

  // Metadata Table
  const summaryData = [
    ["Execution Date", summary.executionDate],
    ["Target Environment", summary.targetEnvironment],
    ["Tenant(s) Tested", summary.tenantTested],
    ["Total Test Cases", summary.totalTestCases],
    ["Passed", summary.passed],
    ["Failed", summary.failed],
    ["Pass Rate (%)", summary.passRate],
  ];

  summarySheet.getRow(3).values = ["Metric", "Value"];
  const sumHeaderRow = summarySheet.getRow(3);
  sumHeaderRow.height = 26;
  sumHeaderRow.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  sumHeaderRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E40AF" },
  };
  sumHeaderRow.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E40AF" },
  };
  sumHeaderRow.alignment = { vertical: "middle" };

  summaryData.forEach((row, idx) => {
    const rowNum = idx + 4;
    const r = summarySheet.getRow(rowNum);
    r.values = [row[0], row[1]];
    r.height = 24;
    r.font = { name: "Segoe UI", size: 10 };
    r.alignment = { vertical: "middle" };

    // Format metrics
    r.getCell(1).font = { bold: true };
    if (row[0] === "Passed") {
      r.getCell(2).font = { bold: true, color: { argb: "FF166534" } };
    } else if (row[0] === "Failed" && Number(row[1]) > 0) {
      r.getCell(2).font = { bold: true, color: { argb: "FFDC2626" } };
    } else if (row[0] === "Pass Rate (%)") {
      r.getCell(2).font = { bold: true, size: 11, color: { argb: "FF1E40AF" } };
    }

    // Border
    for (let c = 1; c <= 2; c++) {
      r.getCell(c).border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    }
  });

  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 45;

  // ==========================================
  // SHEET 2: Functional Test Results
  // ==========================================
  const resultsSheet = workbook.addWorksheet("Functional Test Results", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });

  // Headers:
  // 1. Test Case ID
  // 2. Module
  // 3. Test Case Description
  // 4. Target URL
  // 5. Input / Test Data Used
  // 6. Expected Result
  // 7. Actual Result
  // 8. Status
  resultsSheet.columns = [
    { header: "Test Case ID", key: "testId", width: 15 },
    { header: "Module", key: "module", width: 22 },
    { header: "Test Case Description", key: "description", width: 38 },
    { header: "Target URL", key: "targetUrl", width: 35 },
    { header: "Input / Test Data Used", key: "inputData", width: 35 },
    { header: "Expected Result", key: "expectedResult", width: 45 },
    { header: "Actual Result", key: "actualResult", width: 45 },
    { header: "Status", key: "status", width: 14 },
  ];

  // Header row formatting
  const headerRow = resultsSheet.getRow(1);
  headerRow.height = 34;
  headerRow.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E40AF" }, // Sapphire #1E40AF
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF93C5FD" } },
      left: { style: "thin", color: { argb: "FF93C5FD" } },
      bottom: { style: "medium", color: { argb: "FF1E3A8A" } },
      right: { style: "thin", color: { argb: "FF93C5FD" } },
    };
  });

  // Populate data rows
  results.forEach((res) => {
    const row = resultsSheet.addRow({
      testId: res.testId,
      module: res.module,
      description: res.description,
      targetUrl: res.targetUrl,
      inputData: res.inputData,
      expectedResult: res.expectedResult,
      actualResult: res.actualResult,
      status: res.status,
    });

    row.height = 42;
    row.font = { name: "Segoe UI", size: 10 };
    row.alignment = { vertical: "top", wrapText: true };

    // Align ID and Status to center
    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(1).font = { bold: true };

    const statusCell = row.getCell(8);
    statusCell.alignment = { vertical: "middle", horizontal: "center" };
    statusCell.font = { bold: true, size: 11 };

    if (res.status === "PASS") {
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDCFCE7" }, // Soft green
      };
      statusCell.font = { bold: true, color: { argb: "FF15803D" } }; // Dark green
    } else {
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEE2E2" }, // Soft red
      };
      statusCell.font = { bold: true, color: { argb: "FFB91C1C" } }; // Dark red
    }

    // Border for every cell
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  await workbook.xlsx.writeFile(filePath);
  console.log(`Report successfully generated at: ${filePath}`);
  return filePath;
}
