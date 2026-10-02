import { describe, expect, it } from "vitest";
import { consumeSseStream } from "./sse-consume";

function sseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
	return new Response(stream, { status: 200 });
}

describe("consumeSseStream", () => {
	it("returns server JSON errors on non-ok responses", async () => {
		const response = new Response(JSON.stringify({ error: "Kredit habis." }), {
			status: 403,
		});
		await expect(consumeSseStream(response)).resolves.toEqual({
			error: "Kredit habis.",
		});
	});

	it("falls back to a generic message on non-ok responses without JSON", async () => {
		const response = new Response("bad gateway", { status: 502 });
		const result = await consumeSseStream(response);
		expect(result.error).toBeTruthy();
	});

	it("surfaces in-stream error events", async () => {
		const response = sseResponse([
			`data: ${JSON.stringify({ type: "started" })}\n\n`,
			`data: ${JSON.stringify({ type: "error", error: "Gagal menyimpan." })}\n\n`,
		]);
		await expect(consumeSseStream(response)).resolves.toEqual({
			error: "Gagal menyimpan.",
		});
	});

	it("succeeds only when a done event was observed", async () => {
		const response = sseResponse([
			`data: ${JSON.stringify({ type: "started" })}\n\n`,
			`data: ${JSON.stringify({ type: "delta", content: "halo" })}\n\n`,
			`data: ${JSON.stringify({ type: "done" })}\n\n`,
		]);
		await expect(consumeSseStream(response)).resolves.toEqual({ error: null });
	});

	it("rejects truncated streams that end without done", async () => {
		const response = sseResponse([
			`data: ${JSON.stringify({ type: "started" })}\n\n`,
			`data: ${JSON.stringify({ type: "delta", content: "halo" })}\n\n`,
		]);
		const result = await consumeSseStream(response);
		expect(result.error).toMatch(/terputus/);
	});

	it("tolerates chunk boundaries splitting an event in half", async () => {
		const full = `data: ${JSON.stringify({ type: "done" })}\n\n`;
		const cut = Math.floor(full.length / 2);
		const response = sseResponse([full.slice(0, cut), full.slice(cut)]);
		await expect(consumeSseStream(response)).resolves.toEqual({ error: null });
	});
});
