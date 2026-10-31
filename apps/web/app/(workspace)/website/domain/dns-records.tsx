"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { IconButton } from "@/components/ui/codelit/icon-button";
import { Badge, type badgeVariants } from "@/components/ui/codelit/badge";

export const STATUS_VARIANT: Record<
  string,
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>
> = {
  pending: "warning",
  verified: "success",
  failed: "destructive",
};

function recordState(value: boolean | null): string {
  if (value === null) return "not checked";
  return value ? "satisfied" : "unsatisfied";
}

function RecordStateBadge({ value }: { value: boolean | null }) {
  return <Badge variant={value ? "success" : "warning"}>{recordState(value)}</Badge>;
}

export function DnsRecordRow({
  type,
  name,
  value,
  satisfied,
}: {
  type: string;
  name: string;
  value: string;
  satisfied: boolean | null;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 align-middle">{type}</td>
      <td className="max-w-[14rem] break-all px-3 py-2 align-middle font-mono">
        {name}
      </td>
      <td className="max-w-[16rem] break-all px-3 py-2 align-middle font-mono">
        {value}
      </td>
      <td className="px-3 py-2 align-middle">
        <RecordStateBadge value={satisfied} />
      </td>
      <td className="px-2 py-2 align-middle">
        <CopyValueButton value={value} />
      </td>
    </tr>
  );
}

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable over insecure origins.
    }
  }

  return (
    <IconButton
      type="button"
      size="sm"
      aria-label={copied ? "Copied" : "Copy value"}
      onClick={() => void copy()}
    >
      {copied ? <Check /> : <Copy />}
    </IconButton>
  );
}

/** The DNS records to create for a set of hosts, with copy buttons. */
export function DnsRecordsTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="w-10 px-2 py-2">
              <span className="sr-only">Copy</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
