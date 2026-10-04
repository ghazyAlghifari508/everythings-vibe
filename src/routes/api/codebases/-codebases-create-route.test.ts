import { beforeEach, describe, expect, it, vi } from "vitest";

// The create handler is exercised with a recorded db: the insert values are
// captured so the schema contract and the error boundary are asserted against
// real handler code without a live database.
const recorder = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	failWith: null as Error | null,
	logged: [] as unknown[],
}));

type CreateHandler = (args: { request: Request }) => Promise<Response>;

const captured = vi.hoisted(() => ({
	post: null as ((args: { request: Request }) => Promise<Response>) | null,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute:
		() => (options: { server: { handlers: { POST: CreateHandler } } }) => {
			captured.post = options.server.handlers.POST;
			return options;
		},
}));

vi.mock("@/lib/session", () => ({
	requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/db", async () => {
	const { codebaseSyncSessions } = await import("@/db/schema");
	function fakeInsert(table: unknown) {
		const record = { table, values: {} as Record<string, unknown> };
		const chain: Record<string, unknown> = {
			values: (values: Record<string, unknown>) => {
				record.values = values;
				return chain;
			},
			// Each insert reads back only the columns its caller selects, so the
			// fake mirrors that instead of returning one row shape for both. The
			// codebase row echoes the values written, exactly like Postgres.
			returning: () =>
				Promise.resolve(
					table === codebaseSyncSessions
						? [
								{
									expiresAt: new Date(Date.now() + 30 * 60 * 1000),
									cliMinVersion: "2.0.0",
								},
							]
						: [
								{
									id: record.values.id,
									name: record.values.name,
								},
							],
				),
		};
		return { chain, record };
	}
	const tx = {
		insert: (table: unknown) => {
			const { chain, record } = fakeInsert(table);
			recorder.inserts.push(record);
			return chain;
		},
	};
	return {
		db: {
			transaction: (fn: (t: unknown) => Promise<unknown>) => {
				if (recorder.failWith) return Promise.reject(recorder.failWith);
				return fn(tx);
			},
		},
	};
});

import { codebases } from "@/db/schema";
import "./index";

function createHandler(): CreateHandler {
	if (!captured.post)
		throw new Error("codebase create route was not registered");
	return captured.post;
}

function post(body: unknown): Promise<Response> {
	return createHandler()({
		request: new Request("https://example.test/api/codebases", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	});
}

function codebaseInsert() {
	return recorder.inserts.find((entry) => entry.table === codebases);
}

beforeEach(() => {
	recorder.inserts.length = 0;
	recorder.logged.length = 0;
	recorder.failWith = null;
	vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
		recorder.logged.push(args);
	});
});

describe("POST /api/codebases", () => {
	it("creates a codebase and a waiting sync session for an empty body", async () => {
		const res = await post({});

		expect(res.status).toBe(200);
		const payload = (await res.json()) as {
			id: string;
			name: string;
			sync: {
				projectId: string;
				cliMinVersion: string;
				syncCommand: string;
				expiresAt: string;
			};
		};
		// The returned id, the stored id, and the id the CLI is told to sync
		// must be the same codebase.
		expect(payload.id).toBe(codebaseInsert()?.values.id);
		expect(payload.sync.projectId).toBe(payload.id);
		expect(payload.sync.syncCommand).toContain(payload.id);
		expect(payload.sync.cliMinVersion).toBe("2.0.0");
		expect(payload.sync.expiresAt).toBeTruthy();
		expect(payload.name).toBe("Repository Lokal");
	});

	it("persists the placeholder as auto-sourced so the CLI may replace it", async () => {
		await post({});

		expect(codebaseInsert()?.values).toMatchObject({
			userId: "user-1",
			name: "Repository Lokal",
			nameSource: "auto",
		});
	});

	it("persists a user-supplied name as user-sourced", async () => {
		await post({ name: "Movie App" });

		expect(codebaseInsert()?.values).toMatchObject({
			name: "Movie App",
			nameSource: "user",
		});
	});

	it("answers a storage failure with a safe message and no database internals", async () => {
		recorder.failWith = new Error(
			'column "name_source" of relation "codebases" does not exist',
		);

		const res = await post({});

		expect(res.status).toBe(500);
		const payload = (await res.json()) as { error: string; code?: string };
		expect(payload.error).toBe("Gagal membuat codebase");
		expect(payload.code).toBe("CODEBASE_CREATE_FAILED");
		// The driver message stays server-side; the browser must never receive it.
		expect(JSON.stringify(payload)).not.toContain("name_source");
		expect(JSON.stringify(payload)).not.toContain("relation");
		expect(recorder.logged.length).toBeGreaterThan(0);
	});

	it("never issues a credential when the transaction fails", async () => {
		recorder.failWith = new Error("storage unavailable");

		const res = await post({});

		expect(res.status).toBe(500);
		const text = JSON.stringify(await res.json());
		expect(text).not.toContain("syncToken");
	});
});
