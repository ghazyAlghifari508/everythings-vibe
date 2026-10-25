import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: [".env.local", ".env"], quiet: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const connection = await pool.connect();
try {
	// Prevent the smoke worker from claiming live jobs or invoking paid providers.
	await connection.query("select pg_advisory_lock(hashtextextended($1, 0))", [
		"everythings-vibe:studio-dispatch",
	]);
	for (const signal of ["SIGINT", "SIGTERM"]) {
		const child = spawn(
			process.execPath,
			[
				"--import",
				"tsx",
				"--input-type=module",
				"-e",
				`process.on('message', signal => { process.emit(signal); process.disconnect(); }); await import('./src/features/studio/services/studio-worker.ts');`,
			],
			{
				cwd: new URL("../../../../", import.meta.url),
				stdio: ["ignore", "pipe", "pipe", "ipc"],
			},
		);
		assert.ok(child.stdout);
		const stdout = child.stdout;
		let output = "";
		const exited = once(child, "exit");
		const timeout = setTimeout(() => child.kill(), 15000);
		try {
			await new Promise<void>((resolve, reject) => {
				stdout.on("data", (data) => {
					output += data.toString();
					if (output.includes("Studio worker ready")) resolve();
				});
				child.once("error", reject);
				child.once("exit", () =>
					reject(new Error("Worker exited before readiness")),
				);
			});
			await new Promise((resolve) => setTimeout(resolve, 250));
			// Windows does not deliver POSIX signals through child.kill; exercise the installed handlers over IPC.
			child.send(signal);
			const [code] = await exited;
			assert.equal(code, 0);
			console.info(
				`Studio worker ready, polling and graceful ${signal} handler verified`,
			);
		} finally {
			clearTimeout(timeout);
			if (child.exitCode === null) child.kill();
		}
	}
} finally {
	await connection.query("select pg_advisory_unlock(hashtextextended($1, 0))", [
		"everythings-vibe:studio-dispatch",
	]);
	connection.release();
	await pool.end();
}
