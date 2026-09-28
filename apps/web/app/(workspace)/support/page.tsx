import { redirect } from "next/navigation";

/** Legacy kanban inbox — superseded by the unified Inbox at `/`. */
export default function SupportRedirectPage() {
  redirect("/");
}
