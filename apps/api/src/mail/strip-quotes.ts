/** Drops quoted history and common mobile "On … wrote:" prefixes so an
 * inbound reply is stored as the new text only. */
export function stripQuotedReply(text: string): string {
  const normalized = text.replaceAll("\r\n", "\n");
  const cut = normalized.search(
    /\n(?:On .+ wrote:|>{0,2}\s*-----Original Message-----|-{2,} ?Original Message ?-{2,})/i,
  );
  const withoutQuote = cut === -1 ? normalized : normalized.slice(0, cut);
  return withoutQuote
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n")
    .trim();
}
