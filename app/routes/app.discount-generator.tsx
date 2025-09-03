import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import * as React from "react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  DataTable,
  BlockStack,
  Text,
  Layout,
  DropZone,
  Thumbnail,
  ProgressBar,
  ButtonGroup,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { parseCSV } from "../utils/csv.server";
import { generateDiscountCodes } from "../utils/discount.server";
import { generateCSVWithCodes } from "../utils/csv-export.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const intent = formData.get("intent");

    console.log("Action called with intent:", intent);

    if (intent === "upload") {
      const file = formData.get("file") as File;
      console.log("File received:", file?.name, file?.size);

      if (!file) {
        return json({ error: "No file provided" }, { status: 400 });
      }

      const csvData = await parseCSV(file);
      console.log("CSV parsed:", csvData.rowCount, "rows");

      return json({
        success: true,
        csvData,
        intent: "upload"
      });
    }

    if (intent === "generate") {
      const data = JSON.parse(formData.get("data") as string);
      const nameColumn = formData.get("nameColumn") as string;
      const priceColumn = formData.get("priceColumn") as string;
      const transformFunction = formData.get("transformFunction") as string;

      console.log("Generating discounts for", data.length, "rows");

      const results = await generateDiscountCodes(
        admin.graphql,
        data,
        nameColumn,
        priceColumn,
        transformFunction
      );

      return json({
        success: true,
        results,
        originalData: data, // Keep original data for CSV export
        intent: "generate"
      });
    }

    if (intent === "export-csv") {
      const results = JSON.parse(formData.get("results") as string);
      const originalData = JSON.parse(formData.get("originalData") as string);

      const csvContent = generateCSVWithCodes(originalData, results.results);

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="kickstarter_discounts_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return json({ error: "Invalid intent" }, { status: 400 });
  } catch (error: any) {
    console.error("Action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function DiscountGenerator() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();

  const [csvData, setCsvData] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [nameColumn, setNameColumn] = useState("");
  const [priceColumn, setPriceColumn] = useState("");
  const [transformFunction, setTransformFunction] = useState("return name;");
  const [results, setResults] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null);
  const [error, setError] = useState("");

  const isLoading = navigation.state === "submitting";

  // Handle action data updates
  useEffect(() => {
    console.log("Action data received:", actionData);

    if (actionData) {
      if (actionData.error) {
        setError(actionData.error);
        console.error("Error from action:", actionData.error);
      } else if (actionData.intent === "upload" && actionData.csvData) {
        setCsvData(actionData.csvData);
        setError("");
        console.log("CSV data set:", actionData.csvData);
      } else if (actionData.intent === "generate" && actionData.results) {
        setResults(actionData.results);
        setOriginalData(actionData.originalData);
        setError("");
        console.log("Results set:", actionData.results);
      }
    }
  }, [actionData]);

  const handleFileUpload = useCallback(
    (files: File[]) => {
      const uploadedFile = files[0];
      console.log("File selected:", uploadedFile?.name);

      if (uploadedFile) {
        setFile(uploadedFile);
        setError("");

        const formData = new FormData();
        formData.append("intent", "upload");
        formData.append("file", uploadedFile);

        console.log("Submitting file upload...");
        submit(formData, {
          method: "post",
          encType: "multipart/form-data",
        });
      }
    },
    [submit]
  );

  const handleGenerate = useCallback(() => {
    if (!csvData || !nameColumn || !priceColumn) {
      setError("Please select both name and price columns");
      return;
    }

    console.log("Starting discount generation...");
    setError("");

    const formData = new FormData();
    formData.append("intent", "generate");
    formData.append("data", JSON.stringify(csvData.data));
    formData.append("nameColumn", nameColumn);
    formData.append("priceColumn", priceColumn);
    formData.append("transformFunction", transformFunction);

    submit(formData, { method: "post" });
  }, [submit, csvData, nameColumn, priceColumn, transformFunction]);

  const handleExportCSV = useCallback(() => {
    if (!results || !originalData) return;

    const formData = new FormData();
    formData.append("intent", "export-csv");
    formData.append("results", JSON.stringify(results));
    formData.append("originalData", JSON.stringify(originalData));

    submit(formData, { method: "post" });
  }, [submit, results, originalData]);

  const columnOptions = csvData?.headers
    ? csvData.headers.map((header: string) => ({ label: header, value: header }))
    : [];

  return (
    <Page
      title="Kickstarter Discount Code Generator"
      subtitle="Generate discount codes for Kickstarter backers from CSV data"
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner status="critical" onDismiss={() => setError("")}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card title="Upload CSV File">
            <div style={{ padding: "20px" }}>
              <BlockStack >
                {!file ? (
                  <DropZone onDrop={handleFileUpload} accept=".csv" type="file">
                    <DropZone.FileUpload />
                  </DropZone>
                ) : (
                  <BlockStack>
                    <Thumbnail
                      size="small"
                      alt={file.name}
                      source="https://cdn.shopify.com/s/files/1/0757/9955/files/file-icon.png"
                    />
                    <div>
                      <Text variant="bodyMd" as="p">
                        {file.name}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        {Math.round(file.size / 1024)} KB
                      </Text>
                    </div>
                    <Button
                      variant="plain"
                      onClick={() => {
                        setFile(null);
                        setCsvData(null);
                        setResults(null);
                        setOriginalData(null);
                        setNameColumn("");
                        setPriceColumn("");
                      }}
                    >
                      Remove file
                    </Button>
                  </BlockStack>
                )}

                {isLoading && navigation.formData?.get("intent") === "upload" && (
                  <Banner status="info">
                    <BlockStack>
                      <Text as="p">Uploading and parsing CSV file...</Text>
                      <div style={{ width: "200px" }}>
                        <ProgressBar progress={50} size="small" />
                      </div>
                    </BlockStack>
                  </Banner>
                )}

                {csvData && (
                  <Banner status="success">
                    CSV uploaded successfully! Found {csvData.data.length} rows with{" "}
                    {csvData.headers.length} columns.
                  </Banner>
                )}
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>

        {csvData && (
          <>
            <Layout.Section>
              <Card title="CSV Preview">
                <div style={{ padding: "20px" }}>
                  <Text variant="bodyMd" as="p">
                    <strong>Columns found:</strong> {csvData.headers.join(", ")}
                  </Text>
                  <br />
                  <Text variant="bodyMd" as="p">
                    <strong>First row data:</strong>
                  </Text>
                  <div style={{ fontFamily: "monospace", fontSize: "12px", marginTop: "8px" }}>
                    {csvData.data[0] && Object.entries(csvData.data[0]).map(([key, value]: [string, any]) => (
                      <div key={key}>
                        <strong>{key}:</strong> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card title="Configure Mapping">
                <div style={{ padding: "20px" }}>
                  <FormLayout>
                    <FormLayout.Group>
                      <Select
                        label="Customer Name Column"
                        options={[{ label: "Select column...", value: "" }, ...columnOptions]}
                        value={nameColumn}
                        onChange={setNameColumn}
                      />
                      <Select
                        label="Price Column"
                        options={[{ label: "Select column...", value: "" }, ...columnOptions]}
                        value={priceColumn}
                        onChange={setPriceColumn}
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Name Transform Function (Optional)"
                      value={transformFunction}
                      onChange={setTransformFunction}
                      multiline={4}
                      helpText="JavaScript function to transform customer names. Use 'name' as the input variable."
                    />

                    {nameColumn && priceColumn && csvData.data[0] && (
                      <Banner status="info">
                        <Text as="p">
                          <strong>Preview:</strong><br />
                          Name: {csvData.data[0][nameColumn]} → Price: ${csvData.data[0][priceColumn]}
                        </Text>
                      </Banner>
                    )}
                  </FormLayout>
                </div>
              </Card>
            </Layout.Section>

            {nameColumn && priceColumn && (
              <Layout.Section>
                <Card title="Generate Discount Codes">
                  <div style={{ padding: "20px" }}>
                    <BlockStack>
                      <Button
                        variant="primary"
                        onClick={handleGenerate}
                        loading={isLoading && navigation.formData?.get("intent") === "generate"}
                        disabled={!nameColumn || !priceColumn}
                      >
                        {isLoading && navigation.formData?.get("intent") === "generate"
                          ? "Generating..."
                          : "Generate Discount Codes"
                        }
                      </Button>
                      <Text variant="bodySm" as="p" tone="subdued">
                        This will create individual discount codes for each customer based on their backing amount.
                      </Text>
                    </BlockStack>
                  </div>
                </Card>
              </Layout.Section>
            )}
          </>
        )}

        {results && (
          <Layout.Section>
            <Card>
              <div style={{ padding: "20px" }}>
                <BlockStack>
                  <Text variant="headingMd" as="h3">
                    Generation Results
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Total: {results.summary.total} | Success: {results.summary.successful} |
                    Errors: {results.summary.errors}
                  </Text>
                  {results.summary.successful > 0 && (
                    <ProgressBar
                      progress={(results.summary.successful / results.summary.total) * 100}
                      size="small"
                    />
                  )}
                  <ButtonGroup>
                    <Button
                      onClick={handleExportCSV}
                      loading={isLoading && navigation.formData?.get("intent") === "export-csv"}
                    >
                      {isLoading && navigation.formData?.get("intent") === "export-csv"
                        ? "Exporting..."
                        : "Export CSV with Discount Codes"
                      }
                    </Button>
                    <Button variant="plain" onClick={() => {
                      const resultsOnly = results.results.map((r: any) => ({
                        customer: r.customer,
                        discountCode: r.discountCode || '',
                        amount: r.amount || '',
                        status: r.status,
                        message: r.message
                      }));
                      const csvContent = [
                        'Customer,Discount Code,Amount,Status,Message',
                        ...resultsOnly.map((r: any) =>
                          `"${r.customer}","${r.discountCode}","${r.amount}","${r.status}","${r.message}"`
                        )
                      ].join('\n');

                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `discount_results_${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}>
                      Export Results Only
                    </Button>
                  </ButtonGroup>
                </BlockStack>
              </div>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "numeric", "text"]}
                headings={["Row", "Customer", "Status", "Discount Code", "Amount", "Message"]}
                rows={results.results.map((result: any) => [
                  result.row,
                  result.customer,
                  result.status,
                  result.discountCode || "-",
                  result.amount ? `$${result.amount.toFixed(2)}` : "-",
                  result.message,
                ])}
              />
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
