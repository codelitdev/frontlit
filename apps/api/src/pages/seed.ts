import { db } from "../db/client";
import { genId } from "../db/id";
import { pages, type WidgetInstanceRow } from "../db/schema";
import {
  canonicalPageLayout,
  createRequiredPageLayout,
  repairStoredLayout,
} from "./shared-widgets";
import {
  normalizeFeaturedImage,
  syncFeaturedImageToMediaLibrary,
} from "../documents/queries";

/** TipTap JSON the page-builder widgets expect for rich-text fields.
 * Hand-built here so apps/api never imports `@frontlit/page-builder`
 * (same rule as the support-form seed and documents' opaque TipTap JSON). */
function richText(text: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function block(name: string, settings: Record<string, unknown>): WidgetInstanceRow {
  return {
    widgetId: genId(),
    name,
    deletable: true,
    moveable: true,
    shared: false,
    settings,
  };
}

/** Marketing homepage every new team publishes on day one. Copy sells
 * FrontLit; every href is another seeded public page or an in-page
 * section (`#features`, `#pricing`). */
export function createHomepageBody(): WidgetInstanceRow[] {
  return [
    block("hero", {
      preTitle: "The front office of your SaaS",
      title: "Build your website, publish content, and support users from one place",
      description: richText(
        "FrontLit is the connected front office for your product: a visual site builder, one content system for articles, docs, and changelog, a shared inbox with AI answers, and email — API first and ready to grow with you.",
      ),
      buttonCaption: "See features",
      buttonAction: "/#features",
      secondaryButtonCaption: "Read the docs",
      secondaryButtonAction: "/docs",
      alignment: "right",
      contentAlignment: "center",
      layout: "centered",
    }),
    block("featured", {
      cssId: "features",
      title: "Everything you need to run your business online",
      description: richText(
        "One dashboard for the public site your customers see and the support tools that keep them.",
      ),
      headerAlignment: "center",
      layout: "grid",
      items: [
        {
          title: "Website",
          description:
            "Design and publish pages with a drag-and-drop editor, shared header and footer, and themes.",
          icon: "Globe",
        },
        {
          title: "Content",
          description:
            "Articles, documentation, and product updates share one content system and can feed your site.",
          icon: "Newspaper",
        },
        {
          title: "Support",
          description:
            "A help desk, shared inbox, and AI answers grounded in the docs you publish.",
          icon: "LifeBuoy",
        },
        {
          title: "Engage",
          description: "Grow your audience and send email without leaving FrontLit.",
          icon: "Mail",
        },
      ],
    }),
    block("grid", {
      title: "Explore the site",
      description: richText(
        "These pages ship with every FrontLit site. Replace the copy, or keep them as the spine of your public presence.",
      ),
      headerAlignment: "center",
      columns: 2,
      items: [
        {
          title: "Blog",
          description:
            "Publish articles and grow an audience from the same workspace you use to ship the rest of the site.",
          icon: "Newspaper",
          mediaAlignment: "top",
          buttonCaption: "Read articles",
          buttonAction: "/blog",
        },
        {
          title: "Docs",
          description:
            "Help-center articles your customers can browse — and that FrontLit can search when AI replies.",
          icon: "BookOpen",
          mediaAlignment: "top",
          buttonCaption: "Browse docs",
          buttonAction: "/docs",
        },
        {
          title: "Help desk",
          description: "A public support form that opens tickets in your shared inbox.",
          icon: "Headset",
          mediaAlignment: "top",
          buttonCaption: "Contact us",
          buttonAction: "/help",
        },
        {
          title: "Changelog",
          description:
            "Ship product updates your users can follow without leaving your site.",
          icon: "Sparkles",
          mediaAlignment: "top",
          buttonCaption: "See updates",
          buttonAction: "/changelog",
        },
      ],
    }),
    block("pricing", {
      cssId: "pricing",
      title: "Simple, transparent pricing",
      description: richText(
        "Start free. Upgrade when you need a custom domain, help desk, or more room to grow.",
      ),
      headerAlignment: "center",
      layout: "grid",
      tiers: [
        {
          name: "Starter",
          price: "$0/mo",
          description: "For hobby sites and side projects.",
          features: ["1 website", "FrontLit branding", "Community support"],
          buttonCaption: "Get started",
          buttonAction: "/help",
        },
        {
          name: "Pro",
          price: "$29/mo",
          description: "For growing businesses that need more.",
          features: [
            "Custom domain",
            "Blog, docs, and changelog",
            "Email",
            "Priority support",
          ],
          buttonCaption: "Talk to us",
          buttonAction: "/help",
          highlighted: true,
        },
        {
          name: "Business",
          price: "$79/mo",
          description: "For teams that need scale and control.",
          features: [
            "Help desk and chatbot",
            "Team seats",
            "AI answers from your docs",
            "Dedicated support",
          ],
          buttonCaption: "Contact sales",
          buttonAction: "/help",
        },
      ],
    }),
    block("faq", {
      cssId: "faq",
      title: "Frequently asked questions",
      headerAlignment: "left",
      layout: "list",
      items: [
        {
          id: genId(),
          question: "What can I build with FrontLit?",
          answer:
            "A marketing website, articles, documentation, product updates, a help desk, and email — all from one connected dashboard.",
        },
        {
          id: genId(),
          question: "Do I need to know how to code?",
          answer:
            "No. Every page is assembled from ready-made blocks, and you can customize copy, media, and layout without touching code.",
        },
        {
          id: genId(),
          question: "Can I use my own domain?",
          answer:
            "Yes. Every FrontLit site can be connected to a custom domain from website settings.",
        },
        {
          id: genId(),
          question: "How do customers reach support?",
          answer:
            "The /help page ships with a support form. Tickets land in your shared inbox, and you can turn on an AI agent that answers from your published docs.",
        },
        {
          id: genId(),
          question: "Is there a free plan?",
          answer: "Yes. Start for free and upgrade as your audience grows.",
        },
      ],
    }),
    block("banner", {
      title: "Ready to launch your front office?",
      description: richText(
        "Publish this site, write your first doc, and open the help desk — or ask us how FrontLit fits your product.",
      ),
      buttonCaption: "Contact us",
      buttonAction: "/help",
      secondaryButtonCaption: "Read the docs",
      secondaryButtonAction: "/docs",
      contentAlignment: "center",
      layout: "stacked",
    }),
  ];
}

export interface StandardPageDefinition {
  name: string;
  slug: string;
  title?: string;
  description?: string;
  layout?: WidgetInstanceRow[];
  deletable?: boolean;
}

export const STANDARD_PAGES: StandardPageDefinition[] = [
  {
    name: "Homepage",
    slug: "",
    // No SEO title or description: the homepage falls back to the
    // Branding site title and subtitle.
    layout: createHomepageBody(),
  },
  { name: "Blog", slug: "blog" },
  { name: "Changelog", slug: "changelog" },
  { name: "Docs", slug: "docs" },
  {
    name: "Help desk",
    slug: "help",
    // Pre-placed so the seeded page works out of the box (architecture.md
    // §4.2/§11.2) — matches `@frontlit/page-builder`'s `support-form`
    // block shape, hand-built here rather than imported so apps/api never
    // pulls in the page-builder's browser/React dependency graph (same
    // rule as documents' opaque TipTap JSON, §5.1).
    layout: [
      {
        widgetId: genId(),
        name: "support-form",
        deletable: true,
        moveable: true,
        shared: false,
        settings: {},
      },
    ],
  },
  { name: "Terms of Service", slug: "terms" },
  { name: "Privacy policy", slug: "privacy" },
];

/** Normalizes slugs so leading/trailing slashes are stripped and aliases like "home"/"homepage" map to "". */
export function normalizePageSlug(slug: string): string {
  const trimmed = slug
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
  if (trimmed === "home" || trimmed === "homepage") return "";
  return trimmed;
}

export function getStandardPageBySlug(
  slug: string,
): StandardPageDefinition | undefined {
  const normalized = normalizePageSlug(slug);
  return STANDARD_PAGES.find((p) => p.slug === normalized);
}

/** Seeds the standard or requested pages when a team is created.
 * - If `requestedPages` is omitted, seeds all 7 default standard non-deletable pages.
 * - If `requestedPages` is an array (including empty []), seeds only the requested pages.
 *   Matches standard page templates for standard slugs, and supports custom pages.
 * Published immediately so the site renders something from day one instead of 404ing. */
export async function seedStandardPages(
  teamId: string,
  requestedPages?: import("@frontlit/api-contract").ProvisionPageItem[],
) {
  const pagesToSeed = requestedPages ?? STANDARD_PAGES;
  if (pagesToSeed.length === 0) return;

  const now = new Date();
  const seenSlugs = new Set<string>();
  const values = [];

  for (const item of pagesToSeed) {
    const rawSlug = typeof item === "string" ? item : item.slug;
    const slug = normalizePageSlug(rawSlug);
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const standard = getStandardPageBySlug(slug);
    const isObject = typeof item !== "string";

    const name =
      (isObject ? item.name : undefined) ||
      standard?.name ||
      (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Homepage");

    const title = (isObject ? item.title : undefined) ?? standard?.title ?? null;
    const description =
      (isObject ? item.description : undefined) ?? standard?.description ?? null;
    const deletable =
      isObject && "deletable" in item && item.deletable !== undefined
        ? item.deletable
        : standard
          ? false
          : true;

    const hasCustomLayout =
      isObject &&
      "layout" in item &&
      Array.isArray(item.layout) &&
      item.layout.length > 0;
    const layout = canonicalPageLayout(
      hasCustomLayout
        ? repairStoredLayout(item.layout as WidgetInstanceRow[], slug)
        : createRequiredPageLayout(slug, standard?.layout),
    );

    const rawSocialImage =
      isObject && "socialImage" in item ? item.socialImage : undefined;
    const socialImage = rawSocialImage ? normalizeFeaturedImage(rawSocialImage) : null;
    if (socialImage) {
      await syncFeaturedImageToMediaLibrary(teamId, socialImage);
    }

    values.push({
      teamId,
      name,
      slug,
      deletable,
      title,
      description,
      socialImage,
      draftSocialImage: socialImage,
      layout,
      draftLayout: layout,
      draftTitle: title,
      draftDescription: description,
      publishedAt: now,
    });
  }

  if (values.length > 0) {
    await db.insert(pages).values(values);
  }
}
