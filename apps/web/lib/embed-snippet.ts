/** The snippet for another website or product (docs/embedded-support.md
 * §6.3). FrontLit-hosted sites load the chat on their own. */
export function embedSnippet(teamId: string, origin: string, ownButton: boolean) {
  const init = ownButton
    ? `{ teamId: "${teamId}", launcher: false }`
    : `{ teamId: "${teamId}" }`;
  return `<script>
  window.FrontLit = window.FrontLit || { q: [], push(...a) { this.q.push(a); } };
  FrontLit.push("init", ${init});
</script>
<script async src="${origin}/chat.js"></script>`;
}
