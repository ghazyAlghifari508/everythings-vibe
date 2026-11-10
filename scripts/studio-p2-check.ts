import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: [".env.local", ".env"], quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
const schema = `studio_p2_${crypto.randomUUID().replaceAll("-", "")}`;
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
	await client.query(`create schema "${schema}"`);
	const { rows: tables } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
	for (const { tablename } of tables) {
		const name = tablename.replaceAll('"', '""');
		await client.query(`create table "${schema}"."${name}" (like public."${name}" including all)`);
	}
	const { rows: foreignKeys } = await client.query<{ tablename: string; name: string; definition: string }>(`select c.relname as tablename, con.conname as name, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and con.contype = 'f'`);
	await client.query(`set search_path to "${schema}"`);
	for (const key of foreignKeys) {
		const definition = key.definition.replaceAll("REFERENCES public.", `REFERENCES "${schema}".`).replace(/REFERENCES (?!")([a-z_]+)\(/g, `REFERENCES "${schema}".$1(`);
		await client.query(`alter table "${schema}"."${key.tablename}" add constraint "${key.name}" ${definition}`);
	}
	const migration = await readFile("drizzle/0046_studio_operation_dependencies.sql", "utf8");
	await client.query(migration);
	url.searchParams.set("options", `-csearch_path=${schema}`);
	const command = process.argv.slice(2);
	const executable = process.platform === "win32" ? "cmd.exe" : command[0];
	const args = process.platform === "win32" ? ["/d", "/s", "/c", command.join(" ")] : command.slice(1);
	const child = spawn(executable, args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString() } });
	const exit = Promise.withResolvers<number>();
	child.once("exit", (code) => exit.resolve(code ?? 1));
	child.once("error", exit.reject);
	process.exitCode = await exit.promise;
} finally {
	await client.query(`drop schema "${schema}" cascade`);
	await client.end();
}
