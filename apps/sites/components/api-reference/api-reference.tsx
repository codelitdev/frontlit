import { SiteLink as Link } from "@/components/site-link";
import { Download } from "lucide-react";
import { TextRenderer } from "@frontlit/text-editor/renderer";
import type { TextEditorContent } from "@frontlit/text-editor";
import type {
  ApiOperationSlice,
  ApiParameter,
  ApiRichText,
  ApiSecurityScheme,
  ApiServer,
} from "@frontlit/api-contract";
import type { ThemeStyle } from "@frontlit/page-builder/models";
import {
  Badge,
  Button,
  Caption,
  CodeSnippet,
  Collapsible,
  Header1,
  Header3,
  Header4,
  InlineCode,
  PageCard,
  PageCardContent,
  Section,
  Table,
  Tabs,
  Text1,
  Text2,
} from "@frontlit/page-builder/primitives/server";
import { getTeamThemeStyle } from "@/lib/team-theme";
import { API_REFERENCE_LABEL, type DocsCollection } from "@/lib/docs-tree";
import type { PublicApiReference } from "@/lib/api";
import { DocsSearch } from "@/components/docs-search";
import { Breadcrumb, DocsSidebar } from "@/components/themed-docs";
import { MethodBadge, StatusBadge } from "./method-badge";
import { SchemaView, typeLabel } from "./schema-view";
import { TryIt } from "./try-it";

function RichText({ value, theme }: { value?: ApiRichText; theme: ThemeStyle }) {
  if (!value) return null;
  if (value.kind === "doc")
    return (
      <TextRenderer
        json={value.content as unknown as TextEditorContent}
        theme={theme}
        profile="documentation"
      />
    );
  return (
    <Text1 theme={theme} className="whitespace-pre-line">
      {value.text}
    </Text1>
  );
}

function schemeLabel(scheme: ApiSecurityScheme, theme: ThemeStyle) {
  if (scheme.type === "apiKey")
    return (
      <>
        API key in the{" "}
        <InlineCode theme={theme}>{scheme.name ?? scheme.key}</InlineCode>{" "}
        {scheme.in === "query"
          ? "query parameter"
          : scheme.in === "cookie"
            ? "cookie"
            : "header"}
      </>
    );
  if (scheme.type === "http" && scheme.scheme === "bearer")
    return <>Bearer token{scheme.bearerFormat ? ` (${scheme.bearerFormat})` : ""}</>;
  if (scheme.type === "http" && scheme.scheme === "basic")
    return <>HTTP basic authentication</>;
  if (scheme.type === "oauth2") return <>OAuth 2.0 access token</>;
  if (scheme.type === "openIdConnect") return <>OpenID Connect token</>;
  return <>{scheme.key}</>;
}

/** Shell shared by the landing and operation pages: breadcrumb, search, the
 * docs sidebar and a content area (plus an optional right column). */
async function Shell({
  crumbs,
  collections,
  currentSlug,
  teamId,
  publicApiBaseUrl,
  aside,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  collections: DocsCollection[];
  currentSlug: string;
  teamId: string;
  publicApiBaseUrl: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const theme = await getTeamThemeStyle(teamId);
  return (
    <Section theme={theme}>
      {/* Columns follow the theme's container width, not the viewport:
          narrow themes (Editorial) drop the code column below the content. */}
      <div className="@container flex flex-col gap-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Breadcrumb items={crumbs} theme={theme} />
          <div className="w-full lg:max-w-xs">
            <DocsSearch teamId={teamId} publicApiBaseUrl={publicApiBaseUrl} size="sm" />
          </div>
        </div>
        <div
          className={
            aside
              ? "grid gap-10 @3xl:grid-cols-[220px_minmax(0,1fr)] @5xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,360px)]"
              : "grid gap-10 @3xl:grid-cols-[220px_minmax(0,1fr)]"
          }
        >
          <aside className="hidden @3xl:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
              <DocsSidebar
                collections={collections}
                currentSlug={currentSlug}
                theme={theme}
              />
            </div>
          </aside>
          <article className="flex min-w-0 flex-col gap-8">
            <details className="@3xl:hidden">
              <summary className="cursor-pointer">
                <Text2 theme={theme} className="font-medium" component="span">
                  Browse articles
                </Text2>
              </summary>
              <div className="mt-4">
                <DocsSidebar
                  collections={collections}
                  currentSlug={currentSlug}
                  theme={theme}
                />
              </div>
            </details>
            {children}
          </article>
          {aside ? (
            <aside className="min-w-0 @3xl:col-start-2 @5xl:col-start-auto">
              <div className="flex flex-col gap-6 @5xl:sticky @5xl:top-24">{aside}</div>
            </aside>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function ServerList({ servers, theme }: { servers: ApiServer[]; theme: ThemeStyle }) {
  if (!servers.length)
    return (
      <Caption theme={theme} className="leading-5">
        No server URL in the spec.
      </Caption>
    );
  return (
    <ul className="flex flex-col gap-1">
      {servers.map((server) => (
        <li key={server.url} className="flex flex-wrap items-baseline gap-2">
          <InlineCode theme={theme}>
            {server.url.replace(/\{([^}]+)\}/g, (match, name: string) => {
              const variable = server.variables.find((v) => v.name === name);
              return variable?.default || match;
            })}
          </InlineCode>
          {server.description ? (
            <Caption theme={theme}>{server.description}</Caption>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export async function ThemedApiLanding({
  reference,
  collections,
  teamId,
  publicApiBaseUrl,
}: {
  reference: PublicApiReference;
  collections: DocsCollection[];
  teamId: string;
  publicApiBaseUrl: string;
}) {
  const theme = await getTeamThemeStyle(teamId);
  const { info } = reference;
  return (
    <Shell
      crumbs={[{ label: "Help Center", href: "/docs" }, { label: API_REFERENCE_LABEL }]}
      collections={collections}
      currentSlug={reference.mount}
      teamId={teamId}
      publicApiBaseUrl={publicApiBaseUrl}
    >
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Header1 theme={theme}>{API_REFERENCE_LABEL}</Header1>
          <span className="flex flex-wrap items-center gap-2">
            <Text2 theme={theme} component="span" className="font-medium">
              {info.title}
            </Text2>
            {info.version ? (
              <Badge theme={theme} variant="outline">
                v{info.version.replace(/^v/i, "")}
              </Badge>
            ) : null}
          </span>
        </div>
        <RichText value={info.description} theme={theme} />
        <div>
          <Button theme={theme} variant="outline" asChild>
            <a href="/openapi.json" download>
              <Download aria-hidden="true" />
              openapi.json
            </a>
          </Button>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <PageCard theme={theme}>
          <PageCardContent theme={theme} className="flex flex-col gap-2">
            <Header4 theme={theme}>Base URL</Header4>
            <ServerList servers={info.servers} theme={theme} />
          </PageCardContent>
        </PageCard>
        <PageCard theme={theme}>
          <PageCardContent theme={theme} className="flex flex-col gap-2">
            <Header4 theme={theme}>Authentication</Header4>
            {info.securitySchemes.length ? (
              <ul className="flex flex-col gap-1">
                {info.securitySchemes.map((scheme) => (
                  <li key={scheme.key}>
                    <Text2 theme={theme}>{schemeLabel(scheme, theme)}</Text2>
                  </li>
                ))}
              </ul>
            ) : (
              <Text2 theme={theme}>No authentication described.</Text2>
            )}
          </PageCardContent>
        </PageCard>
      </div>
      {reference.groups.map((group) => (
        <section key={group.name} className="flex flex-col gap-3" id={group.name}>
          <Header3 theme={theme}>{group.name}</Header3>
          <ul className="flex flex-col gap-2">
            {group.operations.map((operation) => (
              <li key={operation.route}>
                <Link href={`/docs/${operation.route}`} className="block">
                  <PageCard theme={theme} isLink>
                    <PageCardContent
                      theme={theme}
                      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="flex min-w-0 items-center gap-2 sm:w-1/2">
                        <MethodBadge method={operation.method} theme={theme} compact />
                        <InlineCode theme={theme} variant="muted" className="truncate">
                          {operation.path}
                        </InlineCode>
                      </span>
                      <Text2
                        theme={theme}
                        component="span"
                        className={operation.deprecated ? "line-through" : undefined}
                      >
                        {operation.title}
                      </Text2>
                    </PageCardContent>
                  </PageCard>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}

function ParameterTable({
  parameters,
  operation,
  theme,
}: {
  parameters: ApiParameter[];
  operation: ApiOperationSlice;
  theme: ThemeStyle;
}) {
  return (
    <Table
      theme={theme}
      columns={[
        { key: "name", label: "Name", className: "md:w-1/3" },
        { key: "type", label: "Type", className: "md:w-1/4" },
        { key: "description", label: "Description" },
      ]}
      rows={parameters.map((parameter) => ({
        name: (
          <span className="inline-flex flex-wrap items-center gap-2">
            <InlineCode theme={theme}>{parameter.name}</InlineCode>
            {parameter.required ? <Caption theme={theme}>required</Caption> : null}
            {parameter.deprecated ? (
              <Badge theme={theme} variant="destructive">
                deprecated
              </Badge>
            ) : null}
          </span>
        ),
        type: (
          <InlineCode theme={theme} variant="muted">
            {parameter.schema
              ? typeLabel(operation.schemas, parameter.schema)
              : "string"}
          </InlineCode>
        ),
        description: parameter.description ? (
          <Text2 theme={theme} component="span">
            {parameter.description}
          </Text2>
        ) : (
          <Caption theme={theme}>—</Caption>
        ),
      }))}
    />
  );
}

export async function ThemedApiOperation({
  reference,
  operation,
  route,
  collections,
  teamId,
  publicApiBaseUrl,
}: {
  reference: PublicApiReference;
  operation: ApiOperationSlice;
  route: string;
  collections: DocsCollection[];
  teamId: string;
  publicApiBaseUrl: string;
}) {
  const theme = await getTeamThemeStyle(teamId);
  const locations = (["path", "query", "header", "cookie"] as const)
    .map((location) => ({
      location,
      parameters: operation.parameters.filter((p) => p.in === location),
    }))
    .filter((group) => group.parameters.length);
  const examples = operation.responses.flatMap((response) =>
    response.content[0]?.example
      ? [{ status: response.status, example: response.content[0].example }]
      : [],
  );
  const firstSuccess = Math.max(
    0,
    operation.responses.findIndex((r) => /^2/.test(r.status)),
  );
  const tryIt = <TryIt model={operation.playground} title={operation.title} />;
  const aside = (
    <>
      <div className="hidden @5xl:block">{tryIt}</div>
      <section className="flex flex-col gap-2" aria-label="Code samples">
        <Header4 theme={theme}>Request</Header4>
        <Tabs
          theme={theme}
          label="Code samples"
          items={operation.codeSamples.map((sample) => ({
            label: sample.label,
            content: <CodeSnippet theme={theme} code={sample.source} />,
          }))}
        />
      </section>
      {examples.length ? (
        <section className="flex flex-col gap-2" aria-label="Response examples">
          <Header4 theme={theme}>Response</Header4>
          <Tabs
            theme={theme}
            label="Response examples"
            items={examples.map((example) => ({
              label: example.status,
              content: (
                <CodeSnippet
                  theme={theme}
                  code={example.example}
                  className="max-h-96 overflow-auto"
                />
              ),
            }))}
          />
        </section>
      ) : null}
    </>
  );

  return (
    <Shell
      crumbs={[
        { label: "Help Center", href: "/docs" },
        { label: API_REFERENCE_LABEL, href: `/docs/${reference.mount}` },
        {
          label: operation.group,
          href: `/docs/${reference.mount}#${encodeURIComponent(operation.group)}`,
        },
        { label: operation.title },
      ]}
      collections={collections}
      currentSlug={route}
      teamId={teamId}
      publicApiBaseUrl={publicApiBaseUrl}
      aside={aside}
    >
      <header className="flex flex-col gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <MethodBadge method={operation.method} theme={theme} />
          <InlineCode theme={theme} className="break-all">
            {operation.path}
          </InlineCode>
          {operation.deprecated ? (
            <Badge theme={theme} variant="destructive">
              Deprecated
            </Badge>
          ) : null}
        </span>
        <Header1 theme={theme}>{operation.title}</Header1>
        <RichText value={operation.description} theme={theme} />
        <div className="@5xl:hidden">{tryIt}</div>
      </header>

      {operation.security ? (
        <section id="authentication" className="flex scroll-mt-24 flex-col gap-3">
          <Header3 theme={theme}>Authentication</Header3>
          {operation.security.length ? (
            <ul className="flex flex-col gap-1">
              {operation.security.map((requirement, index) => (
                <li key={index}>
                  <Text2 theme={theme}>
                    {index > 0 ? "Or " : ""}
                    {requirement.map((key, i) => {
                      const scheme = operation.securitySchemes.find(
                        (s) => s.key === key,
                      );
                      return (
                        <span key={key}>
                          {i > 0 ? " and " : ""}
                          {scheme ? schemeLabel(scheme, theme) : key}
                        </span>
                      );
                    })}
                  </Text2>
                </li>
              ))}
            </ul>
          ) : (
            <Text2 theme={theme}>No authentication required.</Text2>
          )}
        </section>
      ) : null}

      {locations.length ? (
        <section id="parameters" className="flex scroll-mt-24 flex-col gap-4">
          <Header3 theme={theme}>Parameters</Header3>
          {locations.map((group) => (
            <div key={group.location} className="flex flex-col gap-2">
              <Header4 theme={theme} className="capitalize">
                {group.location} parameters
              </Header4>
              <ParameterTable
                parameters={group.parameters}
                operation={operation}
                theme={theme}
              />
            </div>
          ))}
        </section>
      ) : null}

      {operation.requestBody ? (
        <section id="request-body" className="flex scroll-mt-24 flex-col gap-3">
          <span className="flex flex-wrap items-center gap-3">
            <Header3 theme={theme}>Request body</Header3>
            {operation.requestBody.content.map((content) => (
              <Badge key={content.contentType} theme={theme} variant="outline">
                {content.contentType}
              </Badge>
            ))}
            {operation.requestBody.required ? (
              <Caption theme={theme}>required</Caption>
            ) : null}
          </span>
          {operation.requestBody.description ? (
            <Text2 theme={theme}>{operation.requestBody.description}</Text2>
          ) : null}
          {operation.requestBody.content[0]?.schema ? (
            <SchemaView
              schema={operation.requestBody.content[0].schema}
              schemas={operation.schemas}
              theme={theme}
            />
          ) : null}
        </section>
      ) : null}

      <section id="responses" className="flex scroll-mt-24 flex-col gap-3">
        <Header3 theme={theme}>Responses</Header3>
        {operation.responses.map((response, index) => (
          <Collapsible
            key={response.status}
            id={`response-${response.status.toLowerCase()}`}
            theme={theme}
            defaultOpen={index === firstSuccess}
            className="scroll-mt-24"
            summary={
              <span className="flex items-start gap-2">
                <span className="shrink-0">
                  <StatusBadge status={response.status} theme={theme} />
                </span>
                <Text2 theme={theme} component="span" className="min-w-0">
                  {response.description ?? ""}
                </Text2>
              </span>
            }
          >
            {response.content[0]?.schema ? (
              <SchemaView
                schema={response.content[0].schema}
                schemas={operation.schemas}
                theme={theme}
              />
            ) : (
              <Caption theme={theme}>No response body.</Caption>
            )}
          </Collapsible>
        ))}
      </section>
    </Shell>
  );
}
