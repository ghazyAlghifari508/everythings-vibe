// src/features/greenfield/tests/context7-client.test.ts
// TDD: focused tests for the Context7 JSON-RPC client. Mock global fetch only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	queryDocs,
	resolveLibraryId,
} from "@/features/greenfield/services/context7-client";

const SSE_PREFIX = "event: message\ndata: ";

function jsonRpc(result: unknown, error?: { message: string }) {
	return { jsonrpc: "2.0", id: 1, result, error };
}

function sseResponse(payload: unknown): Response {
	return {
		ok: true,
		text: async () => `${SSE_PREFIX}${JSON.stringify(payload)}\n`,
	} as unknown as Response;
}

// ponytail: regression guard — SSE allows one logical JSON-RPC message to span
// multiple `data:` lines, concatenated with "\n". Body mirrors that framing.
function multilineSseResponse(dataParts: string[]): Response {
	const body = `event: message\ndata: ${dataParts.join("\ndata: ")}\n\n`;
	return { ok: true, text: async () => body } as unknown as Response;
}

function jsonResponse(payload: unknown): Response {
	return {
		ok: true,
		text: async () => JSON.stringify(payload),
	} as unknown as Response;
}

beforeEach(() => {
	process.env.CONTEXT7_MCP_URL = "http://mcp.test/mcp";
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.CONTEXT7_MCP_URL;
});

describe("resolveLibraryId", () => {
	it("parses a live-shaped SSE resolve response", async () => {
		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") {
				return sseResponse(
					jsonRpc({ content: [{ type: "text", text: "ok" }] }),
				);
			}
			return sseResponse(
				jsonRpc({
					content: [
						{
							type: "text",
							text: "Context7-compatible library ID: /example/sdk",
						},
					],
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const id = await resolveLibraryId("example sdk", 1000);
		expect(id).toBe("/example/sdk");

		const calls = fetchMock.mock.calls;
		expect(calls[0][1]).toMatchObject({
			body: expect.stringContaining("initialize"),
		});
		expect(calls[1][1]).toMatchObject({
			body: expect.stringContaining("resolve-library-id"),
		});
	});

	it("returns null when CONTEXT7_MCP_URL is missing (no fetch)", async () => {
		delete process.env.CONTEXT7_MCP_URL;
		const fetchMock = vi.fn(() => {
			throw new Error("fetch must not be called");
		});
		vi.stubGlobal("fetch", fetchMock);

		expect(await resolveLibraryId("example sdk", 1000)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns null on AbortSignal timeout (slow endpoint)", async () => {
		const fetchMock = vi.fn(
			(_url: string, opts: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					opts.signal?.addEventListener("abort", () =>
						reject(new Error("AbortError")),
					);
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		expect(await resolveLibraryId("example sdk", 1)).toBeNull();
	});

	it("returns null when fetch rejects", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			}),
		);
		expect(await resolveLibraryId("example sdk", 1000)).toBeNull();
	});

	it("parses a JSON-RPC message split across repeated data: lines (multiline SSE)", async () => {
		// SSE permits one logical event across repeated data lines.
		const dataParts = JSON.stringify(
			jsonRpc({
				content: [
					{
						type: "text",
						text: "Context7-compatible library ID: /example/sdk",
					},
				],
			}),
			null,
			2,
		).split("\n");
		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") {
				return multilineSseResponse([
					JSON.stringify(jsonRpc({ content: [{ type: "text", text: "ok" }] })),
				]);
			}
			return multilineSseResponse(dataParts);
		});
		vi.stubGlobal("fetch", fetchMock);

		const id = await resolveLibraryId("example sdk", 1000);
		expect(id).toBe("/example/sdk");
	});
});

describe("queryDocs", () => {
	it("parses an application/json response", async () => {
		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") {
				return jsonResponse(
					jsonRpc({ content: [{ type: "text", text: "ok" }] }),
				);
			}
			return jsonResponse(
				jsonRpc({
					content: [{ type: "text", text: "Example SDK: generic docs text." }],
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const out = await queryDocs("/example/sdk", "current docs", 1000);
		expect(out).toBe("Example SDK: generic docs text.");
	});

	it("passes arguments with libraryId+query and NO version field", async () => {
		let toolArgs: Record<string, unknown> = {};
		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "tools/call") toolArgs = body.params.arguments;
			return jsonResponse(jsonRpc({ content: [{ type: "text", text: "x" }] }));
		});
		vi.stubGlobal("fetch", fetchMock);

		await queryDocs("/example/sdk", "how to use", 1000);
		expect(toolArgs).toMatchObject({
			libraryId: "/example/sdk",
			query: "how to use",
		});
		expect(toolArgs).not.toHaveProperty("version");
	});

	it("returns empty string when CONTEXT7_MCP_URL is missing", async () => {
		delete process.env.CONTEXT7_MCP_URL;
		const fetchMock = vi.fn(() => {
			throw new Error("fetch must not be called");
		});
		vi.stubGlobal("fetch", fetchMock);

		expect(await queryDocs("/example/sdk", "q", 1000)).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns empty string on fetch rejection", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("boom");
			}),
		);
		expect(await queryDocs("/example/sdk", "q", 1000)).toBe("");
	});
});

describe("security hardening", () => {
	it("rejects redirects on every fetch (redirect: error)", async () => {
		const captured: RequestInit[] = [];
		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			captured.push(opts);
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") {
				return jsonResponse(
					jsonRpc({ content: [{ type: "text", text: "ok" }] }),
				);
			}
			return jsonResponse(
				jsonRpc({
					content: [
						{
							type: "text",
							text: "Context7-compatible library ID: /example/sdk",
						},
					],
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await resolveLibraryId("example sdk", 1000);
		expect(captured.length).toBeGreaterThan(0);
		for (const opts of captured) expect(opts.redirect).toBe("error");
	});

	it("resolves null when streamed body exceeds the byte ceiling (and cancels)", async () => {
		let cancelled = false;
		// Two sub-cap chunks so the second read crosses the cap while the stream
		// is still open — makes the cancel() path genuinely exercised.
		const chunks = [new Uint8Array(600_000), new Uint8Array(600_000)];
		const stream = new ReadableStream<Uint8Array>({
			// Keep the stream readable (never close) so cancel() is genuinely
			// invoked when we cross the cap — a closed stream makes cancel a no-op.
			pull(controller) {
				if (chunks.length) controller.enqueue(chunks.shift() as Uint8Array);
			},
			cancel() {
				cancelled = true;
			},
		});
		const res = {
			ok: true,
			body: stream,
			text: async () => "",
		} as unknown as Response;

		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			// initialize must succeed so the call reaches the tools/call read
			if (body.method === "initialize") {
				return jsonResponse(
					jsonRpc({ content: [{ type: "text", text: "ok" }] }),
				);
			}
			return res;
		});
		vi.stubGlobal("fetch", fetchMock);

		const id = await resolveLibraryId("example sdk", 1000);
		expect(id).toBeNull();
		// reader must be cancelled once the cap is exceeded
		expect(cancelled).toBe(true);
	});

	it("returns empty string for queryDocs when body exceeds the byte ceiling", async () => {
		const huge = new Uint8Array(1_000_001);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(huge);
				controller.close();
			},
		});
		const res = {
			ok: true,
			body: stream,
			text: async () => "",
		} as unknown as Response;

		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") {
				return jsonResponse(
					jsonRpc({ content: [{ type: "text", text: "ok" }] }),
				);
			}
			return res;
		});
		vi.stubGlobal("fetch", fetchMock);

		const out = await queryDocs("/example/sdk", "q", 1000);
		expect(out).toBe("");
	});

	it("gracefully returns null/empty when the stream rejects mid-read", async () => {
		// Fresh erroring stream per tools/call so each export genuinely exercises
		// a mid-read rejection (no shared/consumed body leaking between calls).
		function erroringResponse(): Response {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array([104, 105])); // "hi"
					controller.error(new Error("stream broke"));
				},
			});
			return {
				ok: true,
				body: stream,
				text: async () => "",
			} as unknown as Response;
		}

		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") {
				return jsonResponse(
					jsonRpc({ content: [{ type: "text", text: "ok" }] }),
				);
			}
			return erroringResponse();
		});
		vi.stubGlobal("fetch", fetchMock);

		expect(await resolveLibraryId("example sdk", 1000)).toBeNull();
		expect(await queryDocs("/example/sdk", "q", 1000)).toBe("");
	});
});

describe("protocol", () => {
	it("initializes with protocolVersion 2025-11-25", async () => {
		let initBody: Record<string, unknown> = {};
		const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
			const body = JSON.parse(opts.body as string);
			if (body.method === "initialize") initBody = body.params;
			return jsonResponse(jsonRpc({ content: [{ type: "text", text: "ok" }] }));
		});
		vi.stubGlobal("fetch", fetchMock);

		await resolveLibraryId("example sdk", 1000);
		expect(initBody.protocolVersion).toBe("2025-11-25");
	});
});
