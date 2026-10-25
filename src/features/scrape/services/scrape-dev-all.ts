import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });
const children = [
	spawn(
		process.execPath,
		[
			"--dns-result-order=ipv4first",
			"node_modules/vite/bin/vite.js",
			"dev",
			"--port",
			"3000",
			"--strictPort",
		],
		{ stdio: "inherit", env: process.env },
	),
	spawn(
		process.execPath,
		["--import", "tsx", "src/features/scrape/services/scrape-worker.ts"],
		{ stdio: "inherit", env: process.env },
	),
	// Durable codebase generation runs in a worker, not in the request that
	// accepted it, so a browser refresh cannot cancel accepted work.
	spawn(
		process.execPath,
		["--import", "tsx", "src/features/codebase/services/durable-worker.ts"],
		{ stdio: "inherit", env: process.env },
	),
];
let stopping = false;
function stop(code: number) {
	if (stopping) return;
	stopping = true;
	process.exitCode = code;
	for (const child of children) {
		if (!child.pid) continue;
		if (process.platform === "win32")
			spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
				stdio: "ignore",
			});
		else child.kill("SIGTERM");
	}
}
for (const child of children) {
	child.on("error", (error) => {
		console.error("Development process startup failed", error);
		stop(1);
	});
	child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
