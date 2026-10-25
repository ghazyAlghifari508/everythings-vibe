import { readFile } from "node:fs/promises";
import { summarizeStudioTimings } from "./studio-timing-report";

const path = process.argv[2];
if (!path)
	throw new Error(
		"Usage: pnpm exec tsx src/features/studio/services/studio-timing-report-cli.ts <studio-jsonl-log>",
	);
console.info(
	JSON.stringify(summarizeStudioTimings(await readFile(path, "utf8")), null, 2),
);
