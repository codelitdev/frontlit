import { contract } from "@frontlit/api-contract";
import { createDocumentsRouter } from "./routes";

export default createDocumentsRouter(
    "doc",
    "/content/documentation",
    contract.content.documentation,
);
