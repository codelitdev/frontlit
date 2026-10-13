import type { Article } from "./api";

export type BlogFilter = "all" | "published" | "draft" | "changes";

export interface BlogStatusCounts {
  all: number;
  published: number;
  draft: number;
  changes: number;
}

export function getBlogStatusCounts(posts: Article[]): BlogStatusCounts {
  return posts.reduce<BlogStatusCounts>(
    (counts, post) => {
      counts.all += 1;
      if (post.status === "published" || post.status === "published_with_changes") {
        counts.published += 1;
      }
      if (post.status === "draft") counts.draft += 1;
      if (post.status === "published_with_changes") counts.changes += 1;
      return counts;
    },
    { all: 0, published: 0, draft: 0, changes: 0 },
  );
}

export function filterBlogPosts(
  posts: Article[],
  filter: BlogFilter,
  query: string,
): Article[] {
  const normalizedQuery = query.trim().toLowerCase();

  return posts.filter((post) => {
    const matchesStatus =
      filter === "all" ||
      (filter === "published" &&
        (post.status === "published" || post.status === "published_with_changes")) ||
      (filter === "draft" && post.status === "draft") ||
      (filter === "changes" && post.status === "published_with_changes");

    if (!matchesStatus) return false;
    if (!normalizedQuery) return true;

    return (
      post.draftTitle.toLowerCase().includes(normalizedQuery) ||
      post.slug.toLowerCase().includes(normalizedQuery) ||
      post.draftMeta.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
    );
  });
}

export function sortBlogPostsByUpdatedAt(posts: Article[]): Article[] {
  return [...posts].sort((left, right) => {
    const leftTime = left.updatedAt
      ? new Date(left.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    const rightTime = right.updatedAt
      ? new Date(right.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    return rightTime - leftTime || left.draftTitle.localeCompare(right.draftTitle);
  });
}
