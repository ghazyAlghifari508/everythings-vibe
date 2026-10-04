// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodebaseLibraryItem } from "@/lib/codebase-library";
import { CodebaseLibraryView } from "./codebase-library-view";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
	}: {
		children: React.ReactNode;
		to: string;
		params?: { id: string };
	}) => {
		const href = params?.id ? `${to.replace("$id", params.id)}` : to;
		return <a href={href}>{children}</a>;
	},
}));

function makeItem(
	overrides: Partial<CodebaseLibraryItem> = {},
): CodebaseLibraryItem {
	return {
		id: "cb-1",
		name: "<sample codebase>",
		updatedAt: "2026-10-04T22:40:00.000Z",
		fileCount: 37,
		snapshotCreatedAt: "2026-10-04T22:40:00.000Z",
		snapshotStatus: "uploaded",
		summary: null,
		framework: null,
		language: null,
		packageManager: null,
		hasReadyAnalysis: false,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("CodebaseLibraryView", () => {
	it("links Hubungkan repository to the new sync wizard", () => {
		render(<CodebaseLibraryView items={[]} />);
		const ctas = screen.getAllByRole("link", {
			name: /Hubungkan repository/i,
		});
		expect(ctas.length).toBeGreaterThan(0);
		for (const cta of ctas) {
			expect(cta.getAttribute("href")).toBe("/plan/codebase");
		}
	});

	it("explains projects persist automatically in the empty state", () => {
		render(<CodebaseLibraryView items={[]} />);
		expect(screen.getByText(/otomatis muncul di sini/i)).toBeDefined();
	});

	it("links each existing project card to its workspace", () => {
		render(
			<CodebaseLibraryView
				items={[makeItem({ id: "cb-react", name: "<sample react>" })]}
			/>,
		);
		const card = screen.getByText("<sample react>").closest("a");
		expect(card?.getAttribute("href")).toBe("/codebases/cb-react");
	});

	it("uses persisted analysis summary when available", () => {
		render(
			<CodebaseLibraryView
				items={[makeItem({ summary: "<sample persisted summary>" })]}
			/>,
		);
		expect(screen.getByText("<sample persisted summary>")).toBeDefined();
	});

	it("renders graceful fallback without fabricated stack", () => {
		render(<CodebaseLibraryView items={[makeItem()]} />);
		expect(screen.queryByText("React")).toBeNull();
		expect(screen.getByText(/37 file/i)).toBeDefined();
	});

	it("keeps a re-synced project out of Siap until its own snapshot is analyzed", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem({
						framework: "React",
						snapshotStatus: "uploaded",
						hasReadyAnalysis: false,
					}),
				]}
			/>,
		);
		expect(screen.queryByText("Siap")).toBeNull();
		expect(screen.getByText("Tersinkron")).toBeDefined();
	});

	it("maps snapshot status to product language", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem({
						id: "cb-ready",
						name: "<sample ready>",
						snapshotStatus: "ready",
					}),
					makeItem({
						id: "cb-failed",
						name: "<sample failed>",
						snapshotStatus: "failed",
					}),
				]}
			/>,
		);
		expect(screen.getByText("Siap")).toBeDefined();
		expect(screen.getByText("Perlu perhatian")).toBeDefined();
	});

	it("filters cards by search query", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem({ id: "cb-a", name: "<sample alpha>" }),
					makeItem({ id: "cb-b", name: "<sample beta>" }),
				]}
			/>,
		);
		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "beta" },
		});
		expect(screen.queryByText("<sample alpha>")).toBeNull();
		expect(screen.getByText("<sample beta>")).toBeDefined();
	});

	it("exposes a single semantic target per card without nested links", () => {
		const { container } = render(
			<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />,
		);
		const links = container.querySelectorAll("li a");
		expect(links.length).toBe(1);
	});
});
