import { contract } from "@frontlit/api-contract";
import { createDocumentsRouter } from "./routes";

export default createDocumentsRouter("doc", contract.docs);
