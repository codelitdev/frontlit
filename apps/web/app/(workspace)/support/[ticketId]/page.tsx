import { redirect } from "next/navigation";

/** Legacy ticket detail — superseded by the unified Inbox at `/`. */
export default function SupportTicketRedirectPage() {
    redirect("/");
}
