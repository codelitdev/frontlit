import { DocumentationProposalReport } from "@/components/content/documentation-proposal-report";
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  return <DocumentationProposalReport proposalId={proposalId} />;
}
