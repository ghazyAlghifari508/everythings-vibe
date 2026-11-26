// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { PrdRetryBar } from "../components/chat/prd-retry-bar";

const mocks = vi.hoisted(() => ({
	loadAsk: vi.fn(),
	invalidate: vi.fn(async () => {}),
}));
vi.mock("../services/ask-loader.functions", () => ({ loadAsk: mocks.loadAsk }));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: mocks.invalidate }),
}));

const onGenerate = vi.fn(async () => {});
beforeEach(() => {
	mocks.loadAsk.mockReset();
	mocks.invalidate.mockClear();
	onGenerate.mockClear();
	useUIStore.getState().hideToast();
});
afterEach(cleanup);

const open = () => {
	render(<PrdRetryBar projectId="p1" onGenerate={onGenerate} />);
	return screen.getByRole("button", { name: /Generate ulang PRD/i });
};

it("regenerates from the persisted Ask handoff exactly once, even on a double click", async () => {
	mocks.loadAsk.mockResolvedValue({
		hasPrd: false,
		savedHandoff: { compiledPrompt: "Aplikasi kasir" },
	});
	const button = open();
	fireEvent.click(button);
	fireEvent.click(button);
	await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
	expect(onGenerate).toHaveBeenCalledWith(
		expect.stringContaining("Aplikasi kasir"),
		"Aplikasi kasir",
	);
	expect(mocks.loadAsk).toHaveBeenCalledTimes(1);
});

it("refreshes instead of generating when the PRD was saved in the meantime", async () => {
	mocks.loadAsk.mockResolvedValue({
		hasPrd: true,
		savedHandoff: { compiledPrompt: "x" },
	});
	fireEvent.click(open());
	await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));
	expect(onGenerate).not.toHaveBeenCalled();
});

it("reports a missing Ask context instead of generating", async () => {
	mocks.loadAsk.mockResolvedValue({ hasPrd: false, savedHandoff: null });
	fireEvent.click(open());
	await waitFor(() => expect(useUIStore.getState().toastType).toBe("error"));
	expect(onGenerate).not.toHaveBeenCalled();
});

it("reports a loader failure and stays retryable", async () => {
	mocks.loadAsk.mockRejectedValueOnce(new Error("Gagal memuat"));
	const button = open();
	fireEvent.click(button);
	await waitFor(() =>
		expect(useUIStore.getState().toastMessage).toBe("Gagal memuat"),
	);
	await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
	expect(onGenerate).not.toHaveBeenCalled();
});
