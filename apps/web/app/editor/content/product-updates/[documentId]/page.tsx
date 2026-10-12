import { redirect } from "next/navigation";

export default async function LegacyProductUpdatesEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  redirect(`/editor/content/changelog/${documentId}`);
}
