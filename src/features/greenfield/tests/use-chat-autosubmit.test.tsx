// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type UseChatAutoSubmitOptions,
	useChatAutoSubmit,
} from "@/features/greenfield/hooks/use-chat-autosubmit";
import { savePendingPrdPrompt } from "@/lib/prompt-handoff";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useLocation: ({ select }: { select: (l: { searchStr: string }) => string }) =>
		select({ searchStr: "" }),
}));
vi.mock("@/features/billing/services/payment.functions", () => ({
	syncPaymentStatus: vi.fn(),
}));

const onSubmitPrompt = vi.fn();

function render(
	projectId: string,
	overrides: Partial<UseChatAutoSubmitOptions> = {},
) {
	return renderHook(
		(props: UseChatAutoSubmitOptions) => useChatAutoSubmit(props),
		{
			initialProps: {
				projectId,
				isStreaming: false,
				isGeneratingPRD: false,
				messageCount: 0,
				onSubmitPrompt,
				...overrides,
			},
		},
	);
}

beforeEach(() => {
	onSubmitPrompt.mockClear();
	window.sessionStorage.clear();
});

describe("useChatAutoSubmit", () => {
	it("submits the pending /ask prompt as a generate request exactly once", () => {
		savePendingPrdPrompt("Aplikasi kasir", "auto", "Aplikasi kasir", "as-1");
		const { rerender } = render("as-1");

		expect(onSubmitPrompt).toHaveBeenCalledTimes(1);
		expect(onSubmitPrompt).toHaveBeenCalledWith(
			expect.stringContaining("Aplikasi kasir"),
			"generate",
			"Aplikasi kasir",
		);

		rerender({
			projectId: "as-1",
			isStreaming: false,
			isGeneratingPRD: false,
			messageCount: 0,
			onSubmitPrompt,
		});
		expect(onSubmitPrompt).toHaveBeenCalledTimes(1);
	});

	it("does not generate again when the project already has a saved PRD", () => {
		savePendingPrdPrompt("Aplikasi kasir", "auto", undefined, "as-2");
		render("as-2", { currentPrdContent: "# PRD tersimpan" });
		expect(onSubmitPrompt).not.toHaveBeenCalled();
	});

	it("does not generate when the conversation already has messages", () => {
		savePendingPrdPrompt("Aplikasi kasir", "auto", undefined, "as-3");
		render("as-3", { messageCount: 2 });
		expect(onSubmitPrompt).not.toHaveBeenCalled();
	});

	it("does not generate for a read-only project", () => {
		savePendingPrdPrompt("Aplikasi kasir", "auto", undefined, "as-4");
		render("as-4", { isReadOnly: true });
		expect(onSubmitPrompt).not.toHaveBeenCalled();
	});

	it("ignores a pending prompt that belongs to another project", () => {
		savePendingPrdPrompt("Aplikasi kasir", "auto", undefined, "other-project");
		render("as-5");
		expect(onSubmitPrompt).not.toHaveBeenCalled();
	});

	it("does not resubmit when the same project remounts", () => {
		savePendingPrdPrompt("Aplikasi kasir", "auto", undefined, "as-6");
		const first = render("as-6");
		first.unmount();
		savePendingPrdPrompt("Aplikasi kasir", "auto", undefined, "as-6");
		render("as-6");
		expect(onSubmitPrompt).toHaveBeenCalledTimes(1);
	});
});
