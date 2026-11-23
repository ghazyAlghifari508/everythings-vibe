import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadStudioQuoteView } from "./studio-credit-adapter.server";

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
		const { requireUserServer } = await import("@/lib/session");
		const user = await requireUserServer();
		return loadStudioQuoteView(user.id, data);
	});
