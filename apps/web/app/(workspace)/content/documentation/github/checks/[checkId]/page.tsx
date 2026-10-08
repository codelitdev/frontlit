import { DocumentationCheckReports } from "@/components/content/documentation-check-reports";
export default async function Page({
  params,
}: {
  params: Promise<{ checkId: string }>;
}) {
  const { checkId } = await params;
  return <DocumentationCheckReports checkId={checkId} />;
}
