import type { vi } from "vitest";
import type { DurableGenerationClaim } from "../types/durable-generation";

export function createSseStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
			}
			controller.close();
		},
	});
}

export function createMockDbChain(
	selectFn: ReturnType<typeof vi.fn>,
	updateFn: ReturnType<typeof vi.fn>,
) {
	const selectChain = (result: unknown[]) => {
		const chain = {
			from: () => chain,
			where: () => chain,
			orderBy: () => chain,
			limit: async () => result,
		};
		selectFn.mockReturnValue(chain);
	};

	const updateChain = () => {
		const chain = {
			set: () => chain,
			where: async () => [{ id: "mock" }],
		};
		updateFn.mockReturnValue(chain);
	};

	return { selectChain, updateChain };
}

export function makeTestClaim(
	overrides: Partial<DurableGenerationClaim> = {},
): DurableGenerationClaim {
	return {
		operationId: "op-test",
		userId: "u-1",
		projectId: "p-1",
		stage: "feature",
		token: "tok-1",
		attempt: 1,
		input: {},
		signal: new AbortController().signal,
		...overrides,
	};
}
