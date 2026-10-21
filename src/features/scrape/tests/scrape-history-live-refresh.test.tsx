// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScrapeHistoryLiveRefresh } from "@/features/scrape/hooks/use-scrape-history-live-refresh";

function Harness({
	items,
	refresh,
}: {
	items: ReadonlyArray<{ status: string }>;
	refresh: () => void;
}) {
	useScrapeHistoryLiveRefresh(items, refresh);
	return null;
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("useScrapeHistoryLiveRefresh", () => {
	it("re-reads the history while a result is still processing", async () => {
		vi.useFakeTimers();
		const refresh = vi.fn();
		render(<Harness items={[{ status: "extracting" }]} refresh={refresh} />);

		await vi.advanceTimersByTimeAsync(5000);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it("stops refreshing when every result already finished", async () => {
		vi.useFakeTimers();
		const refresh = vi.fn();
		render(
			<Harness
				items={[{ status: "completed" }, { status: "failed" }]}
				refresh={refresh}
			/>,
		);

		await vi.advanceTimersByTimeAsync(15000);
		expect(refresh).not.toHaveBeenCalled();
	});

	it("stops refreshing when the page is left", async () => {
		vi.useFakeTimers();
		const refresh = vi.fn();
		const { unmount } = render(
			<Harness items={[{ status: "queued" }]} refresh={refresh} />,
		);

		await vi.advanceTimersByTimeAsync(5000);
		expect(refresh).toHaveBeenCalledTimes(1);
		unmount();
		await vi.advanceTimersByTimeAsync(15000);
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
