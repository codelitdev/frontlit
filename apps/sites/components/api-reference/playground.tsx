"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  ApiPlaygroundAuth,
  ApiPlaygroundField,
  ApiPlaygroundModel,
} from "@frontlit/api-contract";
import {
  Badge,
  Button,
  Caption,
  CodeSnippet,
  Collapsible,
  Header4,
  InlineCode,
  Input,
  Label,
  NativeSelect,
  PageCard,
  Text2,
  Textarea,
} from "@frontlit/page-builder/primitives/server";
import type { ThemeStyle } from "@frontlit/page-builder/models";
import { MethodBadge, StatusBadge } from "./method-badge";
import {
  buildRequest,
  explainFailure,
  missingInputs,
  paramKey,
  resolveServer,
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

export function Playground({
  model,
  title,
  theme,
  onClose,
}: {
  model: ApiPlaygroundModel;
  title: string;
  theme: ThemeStyle;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
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

  // No cleanup: closing the dialog fires `close`, which would call
  // `onClose`; unmounting removes the element and its modal state anyway.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

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

  const groups = (["path", "query", "header"] as const)
    .map((location) => ({
      location,
      parameters: model.parameters.filter((p) => p.in === location),
    }))
    .filter((group) => group.parameters.length);
  const authOptions = model.auth;
  const schemes = authOptions[input.authOption] ?? [];

  return (
    <dialog
      ref={dialog}
      aria-label={`Try ${title}`}
      onClose={onClose}
      onCancel={onClose}
      className="m-0 ml-auto h-full max-h-none w-full max-w-xl bg-transparent p-0 backdrop:bg-black/40 sm:p-3"
    >
      <PageCard theme={theme} className="flex h-full flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Header4 theme={theme}>{title}</Header4>
            <span className="flex min-w-0 items-center gap-2">
              <MethodBadge method={model.method} theme={theme} />
              <InlineCode theme={theme} variant="muted" className="truncate">
                {model.path}
              </InlineCode>
            </span>
          </div>
          <Button
            theme={theme}
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <section className="flex flex-col gap-3" aria-label="Server">
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
            <Caption theme={theme} className="break-all leading-5">
              Requests go from your browser straight to{" "}
              <InlineCode theme={theme}>{baseUrl}</InlineCode>.
            </Caption>
          </section>

          {authOptions.length ? (
            <section className="flex flex-col gap-3" aria-label="Authentication">
              <Text2 theme={theme} className="font-medium">
                Authentication
              </Text2>
              {authOptions.length > 1 ? (
                <NativeSelect
                  theme={theme}
                  aria-label="Authentication method"
                  value={input.authOption}
                  onChange={(e) => update({ authOption: Number(e.target.value) })}
                >
                  {authOptions.map((option, index) => (
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
            </section>
          ) : null}

          {groups.map((group) => (
            <section
              key={group.location}
              className="flex flex-col gap-3"
              aria-label={`${group.location} parameters`}
            >
              <Text2 theme={theme} className="font-medium capitalize">
                {group.location} parameters
              </Text2>
              {group.parameters.map((parameter) => {
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
              })}
            </section>
          ))}

          {model.body ? (
            <section className="flex flex-col gap-3" aria-label="Request body">
              <span className="flex items-center gap-2">
                <Text2 theme={theme} className="font-medium">
                  Body
                </Text2>
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
            </section>
          ) : null}

          <div className="flex items-center gap-3">
            <Button theme={theme} type="submit" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? "Sending…" : "Send request"}
            </Button>
          </div>

          <div aria-live="polite" className="flex flex-col gap-3">
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
        </form>
      </PageCard>
    </dialog>
  );
}
