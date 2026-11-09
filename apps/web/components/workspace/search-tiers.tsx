"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import type { AiConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Which search tiers the team's own AI keys unlock. */
export function searchTiers(ai: AiConfig | null) {
  const chatKey = Boolean(ai?.hasApiKey);
  // OpenAI and Azure reuse the chat key for embeddings; others need their own.
  const embeddings = Boolean(
    ai?.embedding?.hasApiKey ||
      (chatKey && (ai?.provider === "openai" || ai?.provider === "azure")),
  );
  return [
    {
      label: "Keyword search",
      description: "Matches the words visitors use, with word stemming. Always on.",
      on: true,
    },
    {
      label: "Meaning-based search",
      description: "Also finds content that says the same thing in other words.",
      on: embeddings,
      needs: "Needs an embedding key",
    },
    {
      label: "AI reranking",
      description: "Your chat model picks the passages that best answer each question.",
      on: chatKey,
      needs: "Needs an AI provider key",
    },
  ];
}

export function SearchTiers({
  ai,
  showSetupLink = false,
}: {
  ai: AiConfig | null;
  showSetupLink?: boolean;
}) {
  const tiers = searchTiers(ai);
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-col gap-2.5">
        {tiers.map((tier) => (
          <li key={tier.label} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                tier.on ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {tier.on ? <Check className="size-3" /> : <Minus className="size-3" />}
            </span>
            <span className="min-w-0">
              <span className="font-semibold">{tier.label}</span>
              <span className="sr-only">{tier.on ? " (on)" : " (off)"}</span>
              {!tier.on && tier.needs && (
                <span className="text-muted-foreground"> · {tier.needs}</span>
              )}
              <span className="mt-0.5 block text-muted-foreground">
                {tier.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {showSetupLink && tiers.some((tier) => !tier.on) && (
        <Link
          href="/settings/ai"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Add keys in Settings › AI
        </Link>
      )}
    </div>
  );
}
