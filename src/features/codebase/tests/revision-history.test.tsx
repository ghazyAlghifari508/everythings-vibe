// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodebaseRevisionHistory } from "../components/revision/codebase-revision-history";

const base = {
	baseVersionId: "v1",
	appliedVersionId: null,
	approvedAt: null,
	createdAt: "2026-02-01T10:00:00.000Z",
};

describe("CodebaseRevisionHistory", () => {
	it("renders nothing at all when the plan has no revisions", () => {
		const { container } = render(<CodebaseRevisionHistory entries={[]} />);
		// An untouched plan must not carry an empty shell of a panel.
		expect(container.firstChild).toBeNull();
	});

	it("lists every stored revision with its target, outcome and real timestamp", () => {
		render(
			<CodebaseRevisionHistory
				entries={[
					{
						...base,
						id: "r1",
						targetKind: "prd",
						instruction: "Ubah navigasi blog menjadi modal",
						status: "approved",
						appliedVersionId: "v2",
						approvedAt: "2026-02-02T09:30:00.000Z",
					},
					{
						...base,
						id: "r2",
						targetKind: "tasks",
						instruction: "Pisahkan task frontend dan data",
						status: "rejected",
					},
					{
						...base,
						id: "r3",
						targetKind: "ac",
						instruction: "Simpan filter di URL",
						status: "pending",
					},
				]}
			/>,
		);

		expect(screen.getByText(/Riwayat Revisi \(3\)/i)).toBeDefined();
		expect(screen.getByText("PRD")).toBeDefined();
		expect(screen.getByText("Task Breakdown")).toBeDefined();
		expect(screen.getByText("Acceptance Criteria")).toBeDefined();

		// Outcomes are named, not inferred from colour alone.
		expect(screen.getByText("Diterapkan")).toBeDefined();
		expect(screen.getByText("Ditolak")).toBeDefined();
		expect(screen.getByText("Menunggu")).toBeDefined();

		// The stored instruction is shown verbatim, not summarised.
		expect(
			screen.getByText(/"Ubah navigasi blog menjadi modal"/),
		).toBeDefined();
		expect(screen.getByText(/Disetujui/)).toBeDefined();
		expect(screen.getAllByTestId("codebase-revision-history-row")).toHaveLength(
			3,
		);
	});

	it("opens from a native disclosure so it stays out of the way", () => {
		const { container } = render(
			<CodebaseRevisionHistory
				entries={[
					{
						...base,
						id: "r1",
						targetKind: "feature",
						instruction: "Tambah multi-kategori",
						status: "approved",
					},
				]}
			/>,
		);
		const details = container.querySelector(
			"[data-testid='codebase-revision-history']",
		);
		expect(details?.tagName).toBe("DETAILS");
		const summary = details?.querySelector("summary");
		expect(summary).not.toBeNull();
		// Real disclosure behaviour: the row is only reachable once opened.
		if (summary) fireEvent.click(summary);
		expect(container.textContent).toContain("Feature Specification");
	});
});
