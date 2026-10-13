import { pool } from "../db/client";
import { exportDeletionLedger, replayDeletionLedger } from "./deletion-replay";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const allowed = args.every(
    (arg) => arg.startsWith("--after=") || arg.startsWith("--limit="),
  );
  if (!allowed || !["export", "replay"].includes(command))
    throw new Error(
      "Usage: deletion-ledger-cli.ts export|replay [--after=CURSOR] [--limit=1..100]",
    );
  const after = args.find((arg) => arg.startsWith("--after="))?.slice(8);
  const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 100);
  const result =
    command === "export"
      ? await exportDeletionLedger(after, limit)
      : await replayDeletionLedger(after, limit);
  // eslint-disable-next-line no-console -- CLI prints its JSON result on stdout
  console.log(JSON.stringify(result));
}
main()
  .catch(() => {
    // Do not echo operator paths, private query values or record contents.
    console.error(
      "Deletion-ledger operation failed. Check configuration, maintenance mode and ledger integrity. Restore-pending was not cleared.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
