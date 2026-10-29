// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodebaseRevisionReviewDialog } from "../components/revision/codebase-revision-review-dialog";

const proposal = {
	id: "prop-1",
	targetKind: "prd" as const,
	baseVersionId: "v1",
	instruction: "Ubah navigasi blog menjadi modal",
	baseContent: "<!-- SECTION: Overview -->\nOriginal",
	proposedContent: "<!-- SECTION: Overview -->\nUpdated to modal",
	status: "pending" as const,
	impact: {
		ac: "NEEDS_REVIEW" as const,
		tasks: "NEEDS_REVIEW" as const,
		sections: ["Overview"],
	},
	diff: [
		{ type: "removed" as const, text: "Original" },
		{ type: "added" as const, text: "Updated to modal" },
	],
};

describe("CodebaseRevisionReviewDialog", () => {
	it("renders real diff, downstream impact, and handles apply and reject", () => {
		const onApply = vi.fn();
		const onReject = vi.fn();
		const onClose = vi.fn();

		render(
			<CodebaseRevisionReviewDialog
				isOpen={true}
				onClose={onClose}
				proposal={proposal}
				isApplying={false}
				isRejecting={false}
				onApply={onApply}
				onReject={onReject}
			/>,
		);

		// Title & instruction
		expect(screen.getByText(/Revisi PRD/i)).toBeDefined();
		expect(screen.getByText(/Ubah navigasi blog menjadi modal/i)).toBeDefined();

		// Real diff content
		expect(screen.getByText(/Original/i)).toBeDefined();
		expect(screen.getByText(/Updated to modal/i)).toBeDefined();

		// Downstream impact
		expect(screen.getByText(/Acceptance Criteria/i)).toBeDefined();
		expect(screen.getByText(/Task Breakdown/i)).toBeDefined();
		expect(screen.getAllByText(/Perlu ditinjau/i).length).toBeGreaterThan(0);

		// Action buttons
		const applyBtn = screen.getByRole("button", { name: /Terapkan Revisi/i });
		fireEvent.click(applyBtn);
		expect(onApply).toHaveBeenCalledOnce();

		const rejectBtn = screen.getByRole("button", { name: /Tolak/i });
		fireEvent.click(rejectBtn);
		expect(onReject).toHaveBeenCalledOnce();
	});

	it("exposes the third review action only when a handler is wired", () => {
		const onRequestChanges = vi.fn();
		const { unmount } = render(
			<CodebaseRevisionReviewDialog
				isOpen={true}
				onClose={vi.fn()}
				proposal={proposal}
				isApplying={false}
				isRejecting={false}
				onApply={vi.fn()}
				onReject={vi.fn()}
				onRequestChanges={onRequestChanges}
			/>,
		);
		const button = screen.getByRole("button", { name: /Minta Perubahan/i });
		fireEvent.click(button);
		expect(onRequestChanges).toHaveBeenCalledOnce();
		unmount();

		// Without a handler the action is not offered: a control that does nothing
		// is worse than no control.
		const second = render(
			<CodebaseRevisionReviewDialog
				isOpen={true}
				onClose={vi.fn()}
				proposal={proposal}
				isApplying={false}
				isRejecting={false}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(
			second.container.querySelector("button")
				? Array.from(second.container.querySelectorAll("button")).some((el) =>
						/Minta Perubahan/i.test(el.textContent ?? ""),
					)
				: false,
		).toBe(false);
	});

	it("renders task reconciliation items when revising task breakdown", () => {
		const taskProposal = {
			...proposal,
			targetKind: "tasks" as const,
			impact: {
				reconciliation: [
					{ name: "Active Work", action: "modified" as const },
					{
						name: "Done Task",
						action: "needs_review" as const,
						reason: "Dilindungi",
					},
					{ name: "New Task", action: "added" as const },
				],
			},
		};

		render(
			<CodebaseRevisionReviewDialog
				isOpen={true}
				onClose={vi.fn()}
				proposal={taskProposal}
				isApplying={false}
				isRejecting={false}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Revisi Task/i)).toBeDefined();
		expect(screen.getByText("Active Work")).toBeDefined();
		expect(screen.getByText("Done Task")).toBeDefined();
		expect(screen.getByText("New Task")).toBeDefined();
	});
});
