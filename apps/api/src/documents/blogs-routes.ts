import { contract } from "@frontlit/api-contract";
import { createDocumentsRouter } from "./routes";

export default createDocumentsRouter(
  "blog",
  "/content/articles",
  contract.content.articles,
);
