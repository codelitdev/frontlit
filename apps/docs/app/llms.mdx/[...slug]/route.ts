import { source } from "@/lib/source";
import { getLLMText } from "@/lib/get-llm-text";

export const revalidate = false;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const pageSlug = [...slug];
  pageSlug[pageSlug.length - 1] = pageSlug[pageSlug.length - 1].replace(/\.md$/, "");
  const normalizedSlug =
    pageSlug.length === 1 && pageSlug[0] === "index" ? undefined : pageSlug;
  const page = source.getPage(normalizedSlug);

  if (!page) return new Response("Not Found", { status: 404 });

  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  // A flat extensionless export such as self-hosting would collide with the
  // directory needed for self-hosting/github-app. Export text as .md files.
  return source.generateParams().map((item: { slug?: string[] }) => {
    const slug = item.slug?.length ? [...item.slug] : ["index"];
    slug[slug.length - 1] += ".md";
    return { slug };
  });
}
