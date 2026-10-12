export function validateDocTitle(
  value: string,
): { ok: true; title: string } | { ok: false; error: string } {
  const title = value.trim();
  if (!title) {
    return { ok: false, error: "Enter a doc title." };
  }

  return { ok: true, title };
}
