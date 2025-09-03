interface DiscountResult {
  row: number;
  customer: string;
  status: "success" | "error";
  discountCode?: string;
  amount?: number;
  message: string;
}

export function generateCSVWithCodes(
  originalData: any[],
  discountResults: DiscountResult[],
): string {
  if (!originalData.length || !discountResults.length) {
    throw new Error("No data provided for CSV export");
  }

  // Create a map of row numbers to discount results for quick lookup
  const resultMap = new Map<number, DiscountResult>();
  discountResults.forEach((result) => {
    resultMap.set(result.row - 1, result); // Convert to 0-based index
  });

  // Get original headers and add new columns
  const originalHeaders = Object.keys(originalData[0]);
  const newHeaders = [
    ...originalHeaders,
    "Discount_Code",
    "Discount_Amount",
    "Generation_Status",
    "Generation_Message",
    "Generated_At",
  ];

  // Create header row
  const headerRow = newHeaders.map((header) => `"${header}"`).join(",");

  // Create data rows
  const dataRows = originalData.map((row, index) => {
    const result = resultMap.get(index);

    // Get original row values
    const originalValues = originalHeaders.map((header) => {
      const value = row[header] || "";
      return `"${String(value).replace(/"/g, '""')}"`; // Escape quotes
    });

    // Add discount code information
    const discountCode = result?.discountCode || "";
    const discountAmount = result?.amount || "";
    const generationStatus = result?.status || "not_processed";
    const generationMessage = result?.message || "Not processed";
    const generatedAt = new Date().toISOString();

    const newValues = [
      `"${discountCode}"`,
      `"${discountAmount}"`,
      `"${generationStatus}"`,
      `"${generationMessage.replace(/"/g, '""')}"`, // Escape quotes
      `"${generatedAt}"`,
    ];

    return [...originalValues, ...newValues].join(",");
  });

  // Combine header and data
  return [headerRow, ...dataRows].join("\n");
}

// Alternative function for generating a summary CSV
export function generateSummaryCSV(discountResults: DiscountResult[]): string {
  const headers = [
    "Row",
    "Customer_Name",
    "Discount_Code",
    "Discount_Amount",
    "Status",
    "Message",
    "Generated_At",
  ];

  const headerRow = headers.map((h) => `"${h}"`).join(",");

  const dataRows = discountResults.map((result) => {
    const values = [
      result.row,
      result.customer || "",
      result.discountCode || "",
      result.amount || "",
      result.status,
      result.message || "",
      new Date().toISOString(),
    ];

    return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

// Function to generate CSV with only successful discount codes
export function generateSuccessfulCodesCSV(
  originalData: any[],
  discountResults: DiscountResult[],
): string {
  const successfulResults = discountResults.filter(
    (r) => r.status === "success" && r.discountCode,
  );

  if (!successfulResults.length) {
    throw new Error("No successful discount codes to export");
  }

  // Create a map for successful results
  const resultMap = new Map<number, DiscountResult>();
  successfulResults.forEach((result) => {
    resultMap.set(result.row - 1, result);
  });

  // Get original headers and add discount code column
  const originalHeaders = Object.keys(originalData[0]);
  const newHeaders = [...originalHeaders, "Discount_Code", "Discount_Amount"];

  const headerRow = newHeaders.map((h) => `"${h}"`).join(",");

  // Only include rows that had successful discount generation
  const dataRows = originalData
    .map((row, index) => {
      const result = resultMap.get(index);
      if (!result || result.status !== "success") return null;

      const originalValues = originalHeaders.map((header) => {
        const value = row[header] || "";
        return `"${String(value).replace(/"/g, '""')}"`;
      });

      const newValues = [`"${result.discountCode}"`, `"${result.amount}"`];

      return [...originalValues, ...newValues].join(",");
    })
    .filter((row) => row !== null);

  return [headerRow, ...dataRows].join("\n");
}
