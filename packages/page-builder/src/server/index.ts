/**
 * Server-component entry. Safe to import from React Server Components: it
 * pulls in no builder UI and only the client islands the page actually needs.
 */
export * from "./page-renderer";
export { setImageAttributesResolver } from "../components/image";
export type {
  ImageAttributesInput,
  ImageAttributesResolver,
} from "../components/image";
export { loadDataSlots } from "../data-slots";
export type {
  DataSlotLoadRequest,
  DataSlotLoader,
  DataSlotLoaders,
} from "../data-slots";
