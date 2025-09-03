export async function generateDiscountCodes(
  graphql: any,
  data: any[],
  nameColumn: string,
  priceColumn: string,
  transformFunction: string,
) {
  const results: any[] = [];
  let successCount = 0;
  let errorCount = 0;

  const DISCOUNT_CODE_BASIC_CREATE = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    let customerName = row[nameColumn];
    const priceValue = parseFloat(row[priceColumn].replace("£", ""));

    console.log({ priceValue, customerName });

    if (!customerName || isNaN(priceValue)) {
      results.push({
        row: i + 1,
        customer: customerName || "Unknown",
        status: "error",
        message: "Invalid name or price",
      });
      errorCount++;
      continue;
    }

    // Apply transformation function if provided
    if (transformFunction && transformFunction.trim()) {
      try {
        const transformFunc = new Function("name", transformFunction);
        customerName = transformFunc(customerName);
      } catch (error) {
        results.push({
          row: i + 1,
          customer: customerName,
          status: "error",
          message: `Transform function error: ${error.message}`,
        });
        errorCount++;
        continue;
      }
    }

    // Generate unique code
    const timestamp = Date.now();
    const cleanName = customerName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const discountCode = `KICKSTARTER_${cleanName}_${timestamp}`.substring(
      0,
      50,
    );

    try {
      const variables = {
        basicCodeDiscount: {
          title: `Kickstarter Backer - ${customerName}`,
          code: discountCode,
          startsAt: new Date().toISOString(),
          customerSelection: {
            all: true,
          },
          customerGets: {
            value: {
              discountAmount: {
                amount: priceValue.toString(),
              },
            },
            items: {
              all: true,
            },
          },
          appliesOncePerCustomer: true,
          usageLimit: 1,
        },
      };

      const response = await graphql(DISCOUNT_CODE_BASIC_CREATE, {
        variables,
      });

      console.log("Raw response:", response);

      // Parse the response body
      let responseData;
      if (response && typeof response.json === "function") {
        // If it's a Response object, parse the JSON
        responseData = await response.json();
      } else if (response && response.data) {
        // If it's already parsed (some Shopify clients do this)
        responseData = response;
      } else {
        // If it's something else, try to extract the body
        const responseText = await response.text();
        console.log("Response text:", responseText);
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          results.push({
            row: i + 1,
            customer: customerName,
            status: "error",
            message: `Invalid response format: ${responseText.substring(0, 100)}`,
          });
          errorCount++;
          continue;
        }
      }

      console.log(
        "Parsed response data:",
        JSON.stringify(responseData, null, 2),
      );

      // Check for GraphQL errors
      if (responseData.errors) {
        results.push({
          row: i + 1,
          customer: customerName,
          status: "error",
          message: `GraphQL errors: ${responseData.errors.map((e: any) => e.message).join(", ")}`,
        });
        errorCount++;
        continue;
      }

      const discountData = responseData.data?.discountCodeBasicCreate;

      if (!discountData) {
        results.push({
          row: i + 1,
          customer: customerName,
          status: "error",
          message: "No discountCodeBasicCreate data in response",
        });
        errorCount++;
        continue;
      }

      if (discountData.userErrors && discountData.userErrors.length > 0) {
        const errors = discountData.userErrors;
        results.push({
          row: i + 1,
          customer: customerName,
          status: "error",
          message: errors
            .map((e: any) => `${e.field || "unknown"}: ${e.message}`)
            .join(", "),
        });
        errorCount++;
      } else {
        results.push({
          row: i + 1,
          customer: customerName,
          discountCode: discountCode,
          amount: priceValue,
          status: "success",
          message: "Discount code created successfully",
        });
        successCount++;
      }

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (error) {
      results.push({
        row: i + 1,
        customer: customerName,
        status: "error",
        message: `API Error: ${error.message}`,
      });
      errorCount++;
    }
  }

  return {
    results,
    summary: {
      total: data.length,
      successful: successCount,
      errors: errorCount,
    },
  };
}
