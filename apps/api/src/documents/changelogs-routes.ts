import { contract } from "@frontlit/api-contract";
import { createDocumentsRouter } from "./routes";

/** Product updates are documents stored internally as `kind: "changelog"`. */
export default createDocumentsRouter(
  "changelog",
  "/content/product-updates",
  contract.content.productUpdates,
);
