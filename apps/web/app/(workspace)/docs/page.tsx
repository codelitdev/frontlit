import { redirect } from "next/navigation";

export default function LegacyDocsPage() {
  redirect("/content?type=documentation");
}
