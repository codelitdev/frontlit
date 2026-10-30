"use client";

import type React from "react";
import { useMemo, useState } from "react";
import type {
  ApiPlaygroundAuth,
  ApiPlaygroundField,
  ApiPlaygroundModel,
} from "@frontlit/api-contract";
import {
  Badge,
  Caption,
  CodeSnippet,
  Collapsible,
  InlineCode,
  Input,
  Label,
  NativeSelect,
  Text2,
  Textarea,
} from "@frontlit/page-builder/primitives/server";
import type { ThemeStyle } from "@frontlit/page-builder/models";
import { StatusBadge } from "./method-badge";
import { PanelSection, ServerUrl } from "./panel-section";
import {
  buildRequest,
  explainFailure,
  missingInputs,
  paramKey,
  playgroundSections,
  resolveServer,
  sectionsWithMissing,
  sendRequest,
  type PlaygroundInput,
  type PlaygroundResult,
} from "./request";

/** Credentials and the chosen server live for the tab, shared across
 * operation pages; never written to storage or sent to FrontLit. */
const session: {
  credentials: PlaygroundInput["credentials"];
  servers: Record<string, { index: number; variables: Record<string, string> }>;
} = { credentials: {}, servers: {} };

function Field({
  id,
  label,
  required,
  hint,
  theme,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  theme: ThemeStyle;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label theme={theme} htmlFor={id} className="flex items-center gap-2">
        <InlineCode theme={theme}>{label}</InlineCode>
        {required ? <Caption theme={theme}>required</Caption> : null}
      </Label>
      {children}
      {hint ? (
        <Caption theme={theme} className="leading-5">
          {hint}
        </Caption>
      ) : null}
    </div>
  );
}

function ValueInput({
  id,
  field,
  value,
  onChange,
  theme,
}: {
  id: string;
  field: ApiPlaygroundField;
  value: string;
  onChange: (value: string) => void;
  theme: ThemeStyle;
}) {
  if (field.enum?.length)
    return (
      <NativeSelect
        theme={theme}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {field.enum.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
    );
  return (
    <Input
      theme={theme}
      id={id}
      value={value}
      placeholder={field.example}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function AuthFields({
  schemes,
  input,
  setCredential,
  theme,
}: {
  schemes: ApiPlaygroundAuth[];
  input: PlaygroundInput;
  setCredential: (key: string, patch: Record<string, string>) => void;
  theme: ThemeStyle;
}) {
  return (
    <>
      {schemes.map((scheme) => {
        const credential = input.credentials[scheme.key] ?? {};
        const id = `auth-${scheme.key}`;
        if (scheme.kind === "unsupported")
          return (
            <Caption key={scheme.key} theme={theme} className="leading-5">
              {scheme.key}: {scheme.reason}
            </Caption>
          );
        if (scheme.kind === "basic")
          return (
            <div key={scheme.key} className="grid gap-2 sm:grid-cols-2">
              <Field id={`${id}-user`} label="Username" theme={theme}>
                <Input
                  theme={theme}
                  id={`${id}-user`}
                  autoComplete="off"
                  value={credential.username ?? ""}
                  onChange={(e) =>
                    setCredential(scheme.key, { username: e.target.value })
                  }
                />
              </Field>
              <Field id={`${id}-pass`} label="Password" theme={theme}>
                <Input
                  theme={theme}
                  id={`${id}-pass`}
                  type="password"
                  autoComplete="off"
                  value={credential.password ?? ""}
                  onChange={(e) =>
                    setCredential(scheme.key, { password: e.target.value })
                  }
                />
              </Field>
            </div>
          );
        return (
          <Field
            key={scheme.key}
            id={id}
            label={scheme.kind === "apiKey" ? scheme.name : "Bearer token"}
            hint={
              scheme.kind === "apiKey"
                ? `Sent as a ${scheme.in === "query" ? "query parameter" : "header"}.`
                : undefined
            }
            theme={theme}
          >
            <Input
              theme={theme}
              id={id}
              type="password"
              autoComplete="off"
              value={credential.value ?? ""}
              onChange={(e) => setCredential(scheme.key, { value: e.target.value })}
            />
          </Field>
        );
      })}
    </>
  );
}

/** The request form, mounted inline under the operation's request bar. */
export function Playground({
  model,
  theme,
  formId,
}: {
  model: ApiPlaygroundModel;
  theme: ThemeStyle;
  /** Lets the request bar's Send button submit this form. */
  formId: string;
}) {
  const serverKey = model.servers.map((s) => s.url).join("|");
  const remembered = session.servers[serverKey];
  const [input, setInput] = useState<PlaygroundInput>(() => ({
    serverIndex: remembered?.index ?? 0,
    serverVariables: remembered?.variables ?? {},
    parameters: {},
    body: model.body?.example ?? "",
    fields: {},
    files: {},
    authOption: 0,
    credentials: session.credentials,
  }));
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "done"; result: PlaygroundResult }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  // Sections forced open (a required input was left empty).
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const server = model.servers[input.serverIndex] ?? model.servers[0];
  const baseUrl = useMemo(
    () => resolveServer(server.url, server.variables, input.serverVariables),
    [server, input.serverVariables],
  );
  const update = (patch: Partial<PlaygroundInput>) =>
    setInput((prev) => ({ ...prev, ...patch }));
  const setServer = (index: number, variables: Record<string, string>) => {
    session.servers[serverKey] = { index, variables };
    update({ serverIndex: index, serverVariables: variables });
  };
  const setCredential = (key: string, patch: Record<string, string>) => {
    session.credentials = {
      ...session.credentials,
      [key]: { ...session.credentials[key], ...patch },
    };
    update({ credentials: session.credentials });
  };

  const send = async () => {
    const missing = missingInputs(model, input);
    if (missing.length) {
      setOpened(sectionsWithMissing(model, input));
      // After the sections re-mount open: focus the first empty required field.
      const first = model.parameters.find(
        (p) => p.required && !input.parameters[paramKey(p.in, p.name)]?.trim(),
      );
      const id = first
        ? `pg-${paramKey(first.in, first.name)}`
        : model.body && model.body.kind !== "json" && model.body.kind !== "text"
          ? `pg-body-${model.body.fields.find((f) => f.required)?.name}`
          : null;
      requestAnimationFrame(() => (id ? document.getElementById(id)?.focus() : null));
      setState({ kind: "error", message: `Fill in ${missing.join(", ")} first.` });
      return;
    }
    const request = buildRequest(model, input);
    setState({ kind: "sending" });
    try {
      setState({ kind: "done", result: await sendRequest(request) });
    } catch {
      setState({
        kind: "error",
        message: explainFailure(
          request,
          window.location.origin,
          window.location.protocol,
        ),
      });
    }
  };

  const schemes = model.auth[input.authOption] ?? [];
  const parameterFields = (location: string) =>
    model.parameters
      .filter((p) => p.in === location)
      .map((parameter) => {
        const key = paramKey(parameter.in, parameter.name);
        const id = `pg-${key}`;
        return (
          <Field
            key={key}
            id={id}
            label={parameter.name}
            required={parameter.required}
            hint={parameter.description}
            theme={theme}
          >
            <ValueInput
              id={id}
              field={parameter}
              value={input.parameters[key] ?? ""}
              onChange={(value) =>
                update({ parameters: { ...input.parameters, [key]: value } })
              }
              theme={theme}
            />
          </Field>
        );
      });

  const content: Record<string, React.ReactNode> = {
    server: (
      <>
        {model.servers.length > 1 ? (
          <Field id="pg-server" label="Server" theme={theme}>
            <NativeSelect
              theme={theme}
              id="pg-server"
              value={input.serverIndex}
              onChange={(e) => setServer(Number(e.target.value), {})}
            >
              {model.servers.map((s, index) => (
                <option key={s.url} value={index}>
                  {s.description ? `${s.description} — ${s.url}` : s.url}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {server.variables.map((variable) => {
          const id = `pg-var-${variable.name}`;
          const value = input.serverVariables[variable.name] ?? "";
          const change = (next: string) =>
            setServer(input.serverIndex, {
              ...input.serverVariables,
              [variable.name]: next,
            });
          return (
            <Field
              key={variable.name}
              id={id}
              label={variable.name}
              hint={variable.description}
              theme={theme}
            >
              {variable.enum?.length ? (
                <NativeSelect
                  theme={theme}
                  id={id}
                  value={value || variable.default}
                  onChange={(e) => change(e.target.value)}
                >
                  {variable.enum.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  theme={theme}
                  id={id}
                  value={value}
                  placeholder={variable.default}
                  onChange={(e) => change(e.target.value)}
                />
              )}
            </Field>
          );
        })}
      </>
    ),
    auth: (
      <>
        {model.auth.length > 1 ? (
          <NativeSelect
            theme={theme}
            aria-label="Authentication method"
            value={input.authOption}
            onChange={(e) => update({ authOption: Number(e.target.value) })}
          >
            {model.auth.map((option, index) => (
              <option key={index} value={index}>
                {option
                  .map((s) =>
                    s.kind === "apiKey"
                      ? `API key (${s.name})`
                      : s.kind === "bearer"
                        ? "Bearer token"
                        : s.kind === "basic"
                          ? "Basic auth"
                          : s.key,
                  )
                  .join(" + ")}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <AuthFields
          schemes={schemes}
          input={input}
          setCredential={setCredential}
          theme={theme}
        />
        <Caption theme={theme} className="leading-5">
          Credentials stay in this browser tab and are never sent to this site.
        </Caption>
      </>
    ),
    path: parameterFields("path"),
    query: parameterFields("query"),
    header: parameterFields("header"),
    body: model.body ? (
      <>
        <span>
          <Badge theme={theme} variant="outline">
            {model.body.mediaType}
          </Badge>
        </span>
        {model.body.kind === "json" || model.body.kind === "text" ? (
          <Textarea
            theme={theme}
            aria-label="Request body"
            rows={10}
            spellCheck={false}
            className="font-jetbrains-mono text-sm"
            value={input.body}
            onChange={(e) => update({ body: e.target.value })}
          />
        ) : (
          model.body.fields.map((field) => {
            const id = `pg-body-${field.name}`;
            return (
              <Field
                key={field.name}
                id={id}
                label={field.name}
                required={field.required}
                hint={field.description}
                theme={theme}
              >
                {field.binary ? (
                  <Input
                    theme={theme}
                    id={id}
                    type="file"
                    onChange={(e) =>
                      update({
                        files: {
                          ...input.files,
                          [field.name]: e.target.files?.[0] ?? null,
                        },
                      })
                    }
                  />
                ) : (
                  <ValueInput
                    id={id}
                    field={field}
                    value={input.fields[field.name] ?? ""}
                    onChange={(value) =>
                      update({ fields: { ...input.fields, [field.name]: value } })
                    }
                    theme={theme}
                  />
                )}
              </Field>
            );
          })
        )}
      </>
    ) : null,
  };

  return (
    <form
      id={formId}
      aria-label="Try this request"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {playgroundSections(model).map((section) => (
        <PanelSection
          // Re-mounting opens a section that has a missing required input.
          key={`${section.id}${opened.has(section.id) ? ":open" : ""}`}
          label={section.label}
          detail={
            section.id === "server" ? (
              <ServerUrl url={baseUrl} theme={theme} />
            ) : undefined
          }
          collapsible={section.editable !== false}
          theme={theme}
          defaultOpen={opened.has(section.id)}
        >
          {content[section.id]}
        </PanelSection>
      ))}
      {state.kind !== "idle" ? (
        <div
          aria-live="polite"
          className="flex flex-col gap-3 border-t border-border p-4"
        >
          {state.kind === "sending" ? <Caption theme={theme}>Sending…</Caption> : null}
          {state.kind === "error" ? (
            <Text2 theme={theme} className="text-destructive">
              {state.message}
            </Text2>
          ) : null}
          {state.kind === "done" ? (
            <>
              <span className="flex items-center gap-2">
                <StatusBadge status={String(state.result.status)} theme={theme} />
                <Caption theme={theme}>
                  {state.result.statusText ? `${state.result.statusText} · ` : ""}
                  {state.result.durationMs} ms
                </Caption>
              </span>
              {state.result.text !== undefined ? (
                state.result.text ? (
                  <CodeSnippet
                    theme={theme}
                    code={state.result.text}
                    className="max-h-80 overflow-auto"
                  />
                ) : (
                  <Caption theme={theme}>Empty response body.</Caption>
                )
              ) : (
                <Caption theme={theme}>
                  {state.result.contentType || "Binary"} response, {state.result.size}{" "}
                  bytes.
                </Caption>
              )}
              {state.result.headers.length ? (
                <Collapsible theme={theme} summary="Response headers">
                  <ul className="flex flex-col gap-1">
                    {state.result.headers.map(([name, value]) => (
                      <li key={name}>
                        <Caption theme={theme} className="break-all leading-5">
                          <InlineCode theme={theme}>{name}</InlineCode> {value}
                        </Caption>
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
