"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import ArticleView from "@/components/content/article-view";
import DocumentationView from "@/components/content/documentation-view";
import ProductUpdatesView from "@/components/content/product-updates-view";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_ALIASES,
  canReadContentType,
  firstReadableContentType,
  type ContentType,
} from "@/components/content/content-type-nav";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";

function isContentType(value: string | null): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

function resolveContentType(value: string | null): ContentType | null {
  if (isContentType(value)) return value;
  if (value && value in CONTENT_TYPE_ALIASES) {
    return CONTENT_TYPE_ALIASES[value];
  }
  return null;
}

export default function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const router = useRouter();
  const query = use(searchParams);
  const { currentTeam, loading } = useWorkspaceAccess();
  const rawType = typeof query.type === "string" ? query.type : null;
  const requested = resolveContentType(rawType);
  const fallback = firstReadableContentType(
    currentTeam?.effectivePermissions ?? [],
    currentTeam?.isOwner,
  );
  const type =
    isContentType(requested) &&
    canReadContentType(
      requested,
      currentTeam?.effectivePermissions ?? [],
      currentTeam?.isOwner,
    )
      ? requested
      : fallback;

  useEffect(() => {
    if (!loading && type && rawType !== type) {
      router.replace(`/content?type=${type}`);
    }
  }, [loading, rawType, router, type]);

  if (loading || !type) {
    return (
      <ScrollablePage>
        <Loading />
      </ScrollablePage>
    );
  }

  if (type === "documentation") return <DocumentationView />;
  if (type === "changelog") return <ProductUpdatesView />;
  return <ArticleView />;
}
