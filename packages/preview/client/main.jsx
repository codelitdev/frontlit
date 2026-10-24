import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PageRenderer } from "@frontlit/page-builder/renderer";
import { resolveTheme } from "@frontlit/page-builder/theme";
import "@frontlit/page-builder/styles.css";
import "./preview.css";

function App({ data }) {
  const [mode, setMode] = useState(
    localStorage.getItem("frontlit-preview-mode") ?? "light",
  );
  if (data.error)
    return (
      <main className="preview-error">
        <h1>Cannot render this page</h1>
        <pre>{data.error}</pre>
        <p>Fix the source file; the preview will reload.</p>
        <a href="/">Home</a>
      </main>
    );
  const theme = resolveTheme(data.themeId, data.themeStyle);
  const change = (next) => {
    const resolved =
      next === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next;
    localStorage.setItem("frontlit-preview-mode", resolved);
    setMode(resolved);
  };
  const fixtures = data.feeds[location.pathname.replace(/\/$/, "") || "/"];
  const slots = {
    "content-feed": (
      <section className="preview-feed">
        <h2>{fixtures ? "Local feed fixture" : "Content feed — no local fixture"}</h2>
        {fixtures?.map((entry, i) => (
          <article key={i}>
            <a href={entry.href}>{entry.title}</a>
            <p>{entry.description}</p>
          </article>
        ))}
        {!fixtures && (
          <p>
            Add this route to feeds in preview.context.json. FrontLit-hosted content is
            not fetched automatically.
          </p>
        )}
      </section>
    ),
  };
  return (
    <>
      <nav className="preview-toolbar" aria-label="Local preview controls">
        <strong>Local preview</strong>
        <select
          aria-label="Page"
          value={location.pathname}
          onChange={(e) => location.assign(e.target.value)}
        >
          {data.pages.map((p) => (
            <option key={p.path} value={p.path}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={() => change(mode === "light" ? "dark" : "light")}>
          {mode === "light" ? "Dark" : "Light"} mode
        </button>
        {data.missingBranding && <span>Set branding in preview.context.json</span>}
      </nav>
      <PageRenderer
        layout={data.layout}
        theme={theme}
        pageData={data.pageData}
        dataSlots={slots}
        nextTheme={mode}
        onThemeModeChange={change}
      />
    </>
  );
}
fetch("/__frontlit/data?path=" + encodeURIComponent(location.pathname))
  .then((r) => r.json())
  .then((data) => {
    document.title = (data.title ?? "FrontLit") + " · local preview";
    createRoot(document.getElementById("root")).render(<App data={data} />);
  })
  .catch((error) => {
    createRoot(document.getElementById("root")).render(
      <App data={{ error: error.message }} />,
    );
  });
