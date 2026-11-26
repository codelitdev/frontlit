import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "./primitives/themes";
import { PageRenderer } from "./renderer/page-renderer";
import { ServerPageRenderer } from "./server/page-renderer";
import { ThemeModeSwitcher } from "./components/theme-mode-switcher";
import { PageBuilderLabelsProvider } from "./components/labels-provider";
import { CodeSnippet } from "./primitives/code-snippet";
import { HeaderWidget } from "./blocks/header/widget";
import { PricingWidget } from "./blocks/pricing/widget";
import { EmbedWidget } from "./blocks/embed/widget";
import { MediaWidget } from "./blocks/media/widget";
import {
  defaultPageBuilderLabels,
  resolvePageBuilderLabels,
  type PageBuilderLabels,
} from "./labels";
import type { WidgetInstance } from "./models";

const theme = themes[0];

const spanish: Partial<PageBuilderLabels> = {
  switchToDarkMode: "Cambiar a modo oscuro",
  toggleMenu: "Abrir menú",
  githubRepository: "Repositorio de GitHub",
  mostPopular: "Más popular",
  monthly: "Mensual",
  yearly: "Anual",
  embeddedContent: "Contenido incrustado",
  copyToClipboard: "Copiar al portapapeles",
  copy: "Copiar",
  videoThumbnailAlt: (title) => `Miniatura de ${title}`,
};

const instance = (name: string, settings: Record<string, unknown>): WidgetInstance => ({
  widgetId: name,
  name,
  deletable: true,
  moveable: true,
  shared: false,
  settings,
});

const layout: WidgetInstance[] = [
  instance("header", {
    links: [{ id: "l1", label: "Docs", href: "/docs" }],
    githubRepo: "codelitdev/frontlit",
  }),
  instance("pricing", {
    pricingSwitcher: true,
    tiers: [
      {
        name: "Pro",
        price: "$10",
        features: [],
        buttonCaption: "Buy",
        buttonAction: "/buy",
        highlighted: true,
      },
    ],
  }),
  instance("embed", { contentType: "url", content: "https://example.com/form" }),
  instance("code-snippet", { code: "npm i" }),
  instance("media", { youtubeLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
  instance("footer", {}),
];

const renderPage = (labels?: Partial<PageBuilderLabels>) =>
  renderToStaticMarkup(
    <PageRenderer
      layout={layout}
      theme={theme}
      pageData={{ siteTitle: "Acme" }}
      onThemeModeChange={() => {}}
      labels={labels}
    />,
  );

describe("page builder labels", () => {
  it("keeps the English text without labels", () => {
    const html = renderPage();
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('<span class="sr-only">Toggle menu</span>');
    expect(html).toContain('<span class="sr-only">GitHub repository</span>');
    expect(html).toContain(">Most popular<");
    expect(html).toContain(">Monthly<");
    expect(html).toContain(">Yearly<");
    expect(html).toContain('title="Embedded content"');
    expect(html).toContain('aria-label="Copy to clipboard" title="Copy"');
    expect(html).toContain('alt="Thumbnail for "');
  });

  it("shows the labels passed to PageRenderer, including function labels", () => {
    const html = renderPage(spanish);
    expect(html).toContain('aria-label="Cambiar a modo oscuro"');
    expect(html).toContain('<span class="sr-only">Abrir menú</span>');
    expect(html).toContain('<span class="sr-only">Repositorio de GitHub</span>');
    expect(html).toContain(">Más popular<");
    expect(html).toContain(">Mensual<");
    expect(html).toContain(">Anual<");
    expect(html).toContain('title="Contenido incrustado"');
    expect(html).toContain('aria-label="Copiar al portapapeles" title="Copiar"');
    expect(html).toContain('alt="Miniatura de "');
    expect(html).not.toContain("Most popular");
  });

  it("takes labels from a provider around PageRenderer and standalone components", () => {
    const page = renderToStaticMarkup(
      <PageBuilderLabelsProvider labels={{ mostPopular: "Le plus populaire" }}>
        <PageRenderer
          layout={layout}
          theme={theme}
          pageData={{}}
          labels={{ monthly: "Mensuel" }}
        />
      </PageBuilderLabelsProvider>,
    );
    expect(page).toContain(">Le plus populaire<");
    expect(page).toContain(">Mensuel<");
    expect(page).toContain(">Yearly<");

    const switcher = (labels?: Partial<PageBuilderLabels>) =>
      renderToStaticMarkup(
        <PageBuilderLabelsProvider labels={{ switchToDarkMode: "Mode sombre" }}>
          <ThemeModeSwitcher resolved="light" onToggle={() => {}} labels={labels} />
        </PageBuilderLabelsProvider>,
      );
    expect(switcher()).toContain('aria-label="Mode sombre"');
    expect(switcher({ switchToDarkMode: "Modo oscuro" })).toContain(
      'aria-label="Modo oscuro"',
    );
    expect(
      renderToStaticMarkup(<ThemeModeSwitcher resolved="light" onToggle={() => {}} />),
    ).toContain('aria-label="Switch to dark mode"');

    expect(
      renderToStaticMarkup(<CodeSnippet code="x" labels={{ copy: "Kopieren" }} />),
    ).toContain('aria-label="Copy to clipboard" title="Kopieren"');
  });

  it("passes resolved labels through ServerPageRenderer", () => {
    const english = renderToStaticMarkup(
      <ServerPageRenderer layout={layout} theme={theme} pageData={{}} />,
    );
    expect(english).toContain('<span class="sr-only">GitHub repository</span>');
    expect(english).toContain(">Most popular<");
    expect(english).toContain('alt="Thumbnail for "');

    const translated = renderToStaticMarkup(
      <ServerPageRenderer
        layout={layout}
        theme={theme}
        pageData={{}}
        labels={spanish}
      />,
    );
    expect(translated).toContain('<span class="sr-only">Repositorio de GitHub</span>');
    expect(translated).toContain(">Más popular<");
    expect(translated).toContain('<span class="sr-only">Abrir menú</span>');
    expect(translated).toContain('alt="Miniatura de "');
  });

  it("renders blocks given only a theme in English", () => {
    const state = { theme };
    expect(
      renderToStaticMarkup(
        <HeaderWidget
          settings={{ links: [{ id: "a", label: "A", href: "/a" }] }}
          state={state}
          pageData={{}}
        />,
      ),
    ).toContain("Toggle menu");
    expect(
      renderToStaticMarkup(
        <PricingWidget
          settings={{
            tiers: [
              {
                name: "P",
                price: "1",
                features: [],
                buttonCaption: "B",
                buttonAction: "/b",
                highlighted: true,
              },
            ],
          }}
          state={state}
          pageData={{}}
        />,
      ),
    ).toContain("Most popular");
    expect(
      renderToStaticMarkup(
        <EmbedWidget
          settings={{ contentType: "url", content: "https://example.com" }}
          state={state}
          pageData={{}}
        />,
      ),
    ).toContain('title="Embedded content"');
    expect(
      renderToStaticMarkup(
        <MediaWidget
          settings={{ youtubeLink: "https://youtu.be/dQw4w9WgXcQ" }}
          state={{ theme, labels: resolvePageBuilderLabels(spanish) }}
          pageData={{}}
        />,
      ),
    ).toContain('alt="Miniatura de "');
  });

  it("lays labels over English, ignoring undefined", () => {
    expect(resolvePageBuilderLabels()).toBe(defaultPageBuilderLabels);
    const labels = resolvePageBuilderLabels({ close: "Cerrar" }, { close: undefined });
    expect(labels.close).toBe("Cerrar");
    expect(labels.toggleMenu).toBe("Toggle menu");
    expect(defaultPageBuilderLabels.videoThumbnailAlt("Intro")).toBe(
      "Thumbnail for Intro",
    );
  });
});
