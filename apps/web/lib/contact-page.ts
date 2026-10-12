export const CONTACT_PAGE_SIZE = 25;

export function parseContactPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function contactListHref(page: number): string {
  return page <= 1 ? "/contacts" : `/contacts?page=${page}`;
}

export function contactPageCount(total: number, pageSize = CONTACT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function contactPageRange(
  page: number,
  total: number,
  pageSize = CONTACT_PAGE_SIZE,
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, page * pageSize) };
}
