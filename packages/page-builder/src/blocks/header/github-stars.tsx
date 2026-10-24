"use client";

import { useEffect, useState } from "react";
import { formatStars } from "./github";

/**
 * Star count for the header's GitHub link. Fetched in the browser, like
 * CourseLit, because unauthenticated GitHub API calls are limited per IP.
 * Renders nothing until loaded, on error, or for 0 stars.
 */
export function GithubStars({ repo }: { repo: string }) {
  const [stars, setStars] = useState<number>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${repo}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((data) => setStars(data?.stargazers_count))
      .catch(() => {});
    return () => controller.abort();
  }, [repo]);

  if (!stars) return null;
  return <span>{formatStars(stars)}</span>;
}
