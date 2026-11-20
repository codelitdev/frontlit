import { Banner } from "@/components/workspace/banner";

export interface PublishDiagnostic {
  code: string;
  message: string;
}

/** Why a saved draft can't be published yet (e.g. a Button without its link). */
export const PUBLISH_BLOCKED_REASON =
  "Resolve the issues listed above the content before publishing.";

export function PublishBlockers({
  publishable,
  diagnostics,
}: {
  publishable?: boolean;
  diagnostics?: PublishDiagnostic[];
}) {
  if (publishable !== false || !diagnostics?.length) return null;
  return (
    <Banner variant="warning" className="mb-4">
      <p role="status">Draft saved. Resolve these issues before publishing:</p>
      <ul className="mt-1 list-disc pl-5">
        {diagnostics.map((item, index) => (
          <li key={index}>{item.message}</li>
        ))}
      </ul>
    </Banner>
  );
}
