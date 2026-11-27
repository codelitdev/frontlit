import type { Ticket } from "@/lib/api";

function contextValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Who asked and what failed, for a ticket from an in-app support session
 * (docs/embedded-support.md §6.4-6.5): the requester's user ID and account
 * in the customer's product, and the incident context their app sent.
 * Context is untrusted data, so it renders as plain text only.
 */
export function RequesterDetails({ ticket }: { ticket: Ticket }) {
  const account = ticket.requesterAccount;
  const context = Object.entries(ticket.context ?? {}).filter(
    ([, value]) => contextValue(value) !== "",
  );
  if (!ticket.requesterExternalId && !account && context.length === 0) return null;

  return (
    <section
      aria-label="Requester details"
      className="border-b bg-muted/30 px-4 py-3 text-sm sm:px-6"
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        {ticket.requesterExternalId && (
          <>
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="min-w-0 break-all font-mono text-xs leading-5">
              {ticket.requesterExternalId}
            </dd>
          </>
        )}
        {account && (
          <>
            <dt className="text-muted-foreground">Account</dt>
            <dd className="min-w-0 break-words">
              {account.url ? (
                <a
                  href={account.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4"
                >
                  {account.name || account.id}
                </a>
              ) : (
                account.name || account.id
              )}
              {account.name && (
                <span className="font-mono text-xs text-muted-foreground">
                  {" "}
                  · {account.id}
                </span>
              )}
            </dd>
          </>
        )}
        {context.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-all font-mono text-xs leading-5">
              {contextValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
