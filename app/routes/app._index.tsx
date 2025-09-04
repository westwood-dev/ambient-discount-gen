import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Form, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  DataTable,
  Spinner,
  Text,
  Layout,
  DropZone,
  Thumbnail,
  ProgressBar,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { parseCSV } from "../utils/csv.server";
import { generateDiscountCodes } from "../utils/discount.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "upload") {
    try {
      const file = formData.get("file") as File;
      if (!file) {
        return json({ error: "No file provided" }, { status: 400 });
      }

      const csvData = await parseCSV(file);
      return json({ success: true, csvData });
    } catch (error: any) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (intent === "generate") {
    try {
      const data = JSON.parse(formData.get("data") as string);
      const nameColumn = formData.get("nameColumn") as string;
      const priceColumn = formData.get("priceColumn") as string;
      const transformFunction = formData.get("transformFunction") as string;

      // console.log({
      //   data,
      //   nameColumn,
      //   priceColumn,
      //   transformFunction
      // })

      const results = await generateDiscountCodes(
        admin.graphql,
        data,
        nameColumn,
        priceColumn,
        transformFunction
      );

      return json({ success: true, results });
    } catch (error: any) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  return json({ error: "Invalid intent" }, { status: 400 });
};

export default function DiscountGenerator() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [csvData, setCsvData] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [nameColumn, setNameColumn] = useState("");
  const [priceColumn, setPriceColumn] = useState("");
  const [transformFunction, setTransformFunction] = useState("return name.replace('@', '_').replace('.', '_').toLowerCase();");
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState("");

  const isLoading = navigation.state === "submitting";

  // Handle form submission response
  // const actionData = useLoaderData<typeof action>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (navigation.state === "idle" && actionData) {
      if (actionData.error) {
        setError(actionData.error);
      } else if (actionData.csvData) {
        setCsvData(actionData.csvData);
        setError("");
      } else if (actionData.results) {
        setResults(actionData.results);
        setError("");
      }
    }
  }, [navigation.state, actionData]);

  const handleFileUpload = useCallback(
    (files: File[]) => {
      const uploadedFile = files[0];
      if (uploadedFile) {
        setFile(uploadedFile);
        const formData = new FormData();
        formData.append("intent", "upload");
        formData.append("file", uploadedFile);
        submit(formData, {
          method: "post",
          encType: "multipart/form-data",
        });
      }
    },
    [submit]
  );

  const handleGenerate = useCallback(() => {
    if (!csvData || !nameColumn || !priceColumn) return;

    const formData = new FormData();
    formData.append("intent", "generate");
    formData.append("data", JSON.stringify(csvData.data));
    formData.append("nameColumn", nameColumn);
    formData.append("priceColumn", priceColumn);
    formData.append("transformFunction", transformFunction);

    submit(formData, { method: "post" });
  }, [submit, csvData, nameColumn, priceColumn, transformFunction]);

  const columnOptions = csvData
    ? csvData.headers.map((header: string) => ({ label: header, value: header }))
    : [];

  const fileUpload = !file && (
    <DropZone onDrop={handleFileUpload} accept=".csv" type="file">
      <DropZone.FileUpload />
    </DropZone>
  );

  const uploadedFile = file && (
    <BlockStack>
      {/* <Thumbnail */}
      {/*   size="small" */}
      {/*   alt={file.name} */}
      {/*   source="https://cdn.shopify.com/s/files/1/0757/9955/files/file-icon.png" */}
      {/* /> */}
      <div>
        <Text variant="bodyMd" as="p">
          {file.name}
        </Text>
        <Text variant="bodySm" as="p" tone="subdued">
          {Math.round(file.size / 1024)} KB
        </Text>
      </div>
    </BlockStack>
  );

  const resultsTable = results && (
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
          <div>
            <Button onClick={() => {
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
            }}>Export</Button>
          </div>
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
          result.amount ? `£${result.amount.toFixed(2)}` : "-",
          result.message,
        ])}
      />
    </Card>
  );

  return (
    <Page
      title="Kickstarter Discount Code Generator"
      subtitle="Generate discount codes for Kickstarter backers from CSV data"
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner status="critical">
              {error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card title="Upload CSV File">
            <div style={{ padding: "20px" }}>
              <BlockStack >
                {fileUpload}
                {uploadedFile}
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
                    placeholder="return name.replace('@', '_').toLowerCase();"
                    helpText="JavaScript function to transform customer names. Use 'name' as the input variable."
                  />
                </FormLayout>
              </div>
            </Card>
          </Layout.Section>
        )}

        {csvData && nameColumn && priceColumn && (
          <Layout.Section>
            <Card title="Generate Discount Codes">
              <div style={{ padding: "20px" }}>
                <BlockStack>
                  <Button
                    variant="primary"
                    onClick={handleGenerate}
                    loading={isLoading}
                    disabled={!nameColumn || !priceColumn}
                  >
                    {isLoading ? "Generating..." : "Generate Discount Codes"}
                  </Button>
                  <Text variant="bodySm" as="p" tone="subdued">
                    This will create individual discount codes for each customer based on their backing amount.
                  </Text>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>
        )}

        {results && (
          <Layout.Section>
            {resultsTable}
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
