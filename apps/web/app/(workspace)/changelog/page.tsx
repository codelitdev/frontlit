import { redirect } from "next/navigation";

export default function LegacyChangelogPage() {
  redirect("/content?type=changelog");
}
