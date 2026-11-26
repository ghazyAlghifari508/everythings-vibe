import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const studioQuoteScopeSchema = z.object({
	operation: z.enum([
		"studio.generate",
		"studio.add_frame",
		"studio.revise",
		"studio.regenerate",
	]),
	// Bounded to the same limits enforced by the prompt validators upstream.
	frames: z.int().min(1).max(100),
	promptChars: z.int().min(0).max(100_000),
	designMdChars: z.int().min(0).max(1_000_000).optional(),
});

export const loadStudioQuote = createServerFn({ method: "GET" })
	.validator((input: unknown) => studioQuoteScopeSchema.parse(input))
	.handler(async ({ data }) => {
		// Server-only modules stay out of the client import graph: the session
		// and the credit adapter are loaded inside the handler.
		const [{ requireUserServer }, { loadStudioQuoteView }] = await Promise.all([
			import("@/lib/session"),
			import("./studio-credit-adapter.server"),
		]);
		const user = await requireUserServer();
		return loadStudioQuoteView(user.id, data);
	});
