import { defineBillingConfig } from "@codelitdev/billing/config";

export default defineBillingConfig({
  dialect: "postgresql",
  adapter: "drizzle",
  output: "./src/db/schema/billing.generated.ts",
  billableEntity: {
    modelName: "team",
    tableImport: "./schema",
    tableExport: "teams",
    idColumn: "id",
    idType: "text",
    onDelete: "restrict",
  },
  payer: {
    modelName: "account",
    tableImport: "./schema",
    tableExport: "accounts",
    idColumn: "id",
    idType: "text",
    onDelete: "restrict",
  },
  planIds: ["free", "pro", "business", "oss"],
  requiredOfferKeys: ["pro_month", "pro_year", "business_month", "business_year"],
});
