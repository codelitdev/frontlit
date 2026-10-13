import { redirect } from "next/navigation";

export default async function LegacyDocsEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  redirect(`/editor/content/documentation/${documentId}`);
}
