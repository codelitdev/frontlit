/**
 * Retrieval evaluation for one team: how often the expected source is in
 * the top results.
 *
 *   bun run search:eval <public team id> <questions.json> [--rerank]
 *
 * questions.json is an array of
 *   { "question": "Can I cancel anytime?", "expect": "page:pricing" }
 * where `expect` is `<kind>:<source>`: the docs/blog/changelog document id,
 * the page slug ("" for home) or the API route.
 *
 * With --rerank, candidates are reranked by the team's chatbot model, as the
 * chatbot and help desk AI do.
 */
import { readFileSync } from "node:fs";
import { findTeamByPublicId } from "../src/team/queries";
import { getResolvedAiConfig } from "../src/ai/queries";
import { searchContent } from "../src/search/search";
import { rerankCandidates } from "../src/search/rerank";

type Case = { question: string; expect: string };

async function main() {
  const [teamPublicId, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const rerank = process.argv.includes("--rerank");
  if (!teamPublicId || !file) {
    console.error("Usage: search:eval <public team id> <questions.json> [--rerank]");
    process.exit(1);
  }
  const team = await findTeamByPublicId(teamPublicId);
  if (!team) throw new Error(`Team ${teamPublicId} not found`);
  const cases = JSON.parse(readFileSync(file, "utf8")) as Case[];
  const aiConfig = rerank ? await getResolvedAiConfig(team.id) : null;

  let top1 = 0;
  let top5 = 0;
  const misses: string[] = [];
  for (const item of cases) {
    let results = await searchContent(team.id, item.question, 30);
    if (rerank)
      results = (
        await rerankCandidates({
          question: item.question,
          candidates: results,
          aiConfig,
        })
      ).results;
    const keys = [...new Set(results.map((r) => `${r.kind}:${r.documentId}`))];
    const rank = keys.indexOf(item.expect);
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 5) top5++;
    else
      misses.push(
        `${item.question}  →  got ${keys.slice(0, 3).join(", ") || "nothing"}`,
      );
  }
  const pct = (n: number) => `${((100 * n) / Math.max(1, cases.length)).toFixed(0)}%`;
  const lines = [
    `${cases.length} questions${rerank ? " (reranked)" : ""}`,
    `recall@1 ${pct(top1)}  recall@5 ${pct(top5)}`,
    ...(misses.length ? ["", "Misses:", ...misses.map((m) => `- ${m}`)] : []),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
