import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { PageData, ThemeStyle, WidgetProps } from "../../models";
import type { SupportFormSettings } from "./settings";
import { TextRenderer } from "../../components";
import {
  Button,
  Header1,
  Input,
  Label,
  Section,
  Subheader1,
  Text2,
} from "../../primitives";
import { cn } from "../../primitives/lib/utils";

interface DocumentationSuggestion {
  documentId: string;
  slug: string;
  title: string | null;
  kind?: "blog" | "doc" | "changelog";
}

function suggestionHref(item: DocumentationSuggestion) {
  if (item.kind === "blog") return `/blog/${item.slug}`;
  if (item.kind === "changelog") return `/changelog`;
  return `/docs/${item.slug}`;
}

/** Documentation deflection (architecture.md §6.4/§11.2): searches the
 * team's published docs as the visitor types a subject, before they ever
 * submit a ticket. No-ops in isolated previews with no live team/API. */
async function searchDocumentation(
  query: string,
  pageData: PageData,
): Promise<DocumentationSuggestion[]> {
  if (!pageData.teamId || !pageData.publicApiBaseUrl || query.trim().length < 3)
    return [];

  try {
    const res = await fetch(
      `${pageData.publicApiBaseUrl}/public/${pageData.teamId}/content/documentation/search?q=${encodeURIComponent(query)}&k=3`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      items: DocumentationSuggestion[];
    };
    const seen = new Set<string>();
    return body.items.filter((item) =>
      seen.has(item.documentId) ? false : (seen.add(item.documentId), true),
    );
  } catch {
    return [];
  }
}

/** Raises a support ticket via FrontLit's public, unauthenticated ticket
 * endpoint (architecture.md §11.2) — one of the three submission doors,
 * source: "form". Falls back to a local-only success in isolated previews. */
async function submitTicket(
  input: { subject: string; message: string; email: string; name?: string },
  pageData: PageData,
): Promise<{ success: boolean }> {
  if (!pageData.teamId || !pageData.publicApiBaseUrl) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { success: true };
  }

  try {
    const res = await fetch(
      `${pageData.publicApiBaseUrl}/public/${pageData.teamId}/tickets`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, source: "form" }),
      },
    );
    return { success: res.ok };
  } catch {
    return { success: false };
  }
}

export function SupportFormWidget({
  settings: {
    title,
    description,
    buttonCaption = "Submit ticket",
    successMessage = "Thanks — we've got your ticket and will reply by email soon.",
    alignment = "left",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  pageData,
  editing,
  nextTheme,
}: WidgetProps<SupportFormSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState<DocumentationSuggestion[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchDocumentation(subject, pageData).then(setSuggestions);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) return;

    setIsSubmitting(true);
    try {
      const result = await submitTicket(
        { subject, message, email, name: name || undefined },
        pageData,
      );
      if (result.success) {
        setSuccess(true);
        setSubject("");
        setMessage("");
        setEmail("");
        setName("");
        setSuggestions([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCentered = alignment === "center";
  const inputStyles = overriddenTheme.interactives.input;
  const inputTypography = overriddenTheme.typography.input;
  const cardStyles = overriddenTheme.interactives.card;

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      <div
        className={clsx(
          "flex flex-col gap-4",
          isCentered ? "items-center text-center" : "items-start",
        )}
      >
        <Header1 theme={overriddenTheme}>{title}</Header1>
        {description && (
          <Subheader1 theme={overriddenTheme} component="span">
            <TextRenderer json={description} theme={overriddenTheme} />
          </Subheader1>
        )}
      </div>

      {success ? (
        <Text2 theme={overriddenTheme} className="mt-4">
          {successMessage}
        </Text2>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex w-full max-w-lg flex-col gap-3">
          <div className="flex flex-col gap-1 items-start">
            <Label theme={overriddenTheme} htmlFor="subject">
              Subject
            </Label>
            <Input
              theme={overriddenTheme}
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              required
              className="w-full"
            />
          </div>

          {suggestions.length > 0 && (
            <div
              className={cn(
                "rounded-lg border border-border bg-card p-3 text-sm text-card-foreground shadow-sm",
                cardStyles.border?.width,
                cardStyles.border?.radius,
                cardStyles.border?.style,
                cardStyles.shadow,
              )}
            >
              <p className="mb-1 font-medium">This might help:</p>
              <ul className="list-inside list-disc">
                {suggestions.map((doc) => (
                  <li key={doc.documentId}>
                    <a
                      href={suggestionHref(doc)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {doc.title ?? doc.slug}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1 items-start">
            <Label theme={overriddenTheme} htmlFor="message">
              Message
            </Label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue…"
              required
              rows={4}
              className={cn(
                "w-full border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                inputTypography.fontFamily,
                inputTypography.fontSize,
                inputTypography.fontWeight,
                inputTypography.lineHeight,
                inputTypography.letterSpacing,
                inputStyles.border?.width,
                inputStyles.border?.style,
                inputStyles.border?.radius,
                inputStyles.shadow,
                inputStyles.custom,
              )}
            />
          </div>

          <div className="flex flex-col gap-3 sm:!flex-row">
            <div className="flex flex-1 flex-col gap-1 items-start">
              <Label theme={overriddenTheme} htmlFor="email">
                Email
              </Label>
              <Input
                theme={overriddenTheme}
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 items-start">
              <Label theme={overriddenTheme} htmlFor="name">
                Name (optional)
              </Label>
              <Input
                theme={overriddenTheme}
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full"
              />
            </div>
          </div>

          <Button
            theme={overriddenTheme}
            type="submit"
            disabled={!editing && (isSubmitting || !subject || !message || !email)}
            className="self-start"
          >
            {buttonCaption}
          </Button>
        </form>
      )}
    </Section>
  );
}
