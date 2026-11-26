// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AcViewer } from "../components/ac/ac-viewer";
import { ChatMessageList } from "../components/chat/chat-message-list";
import { ALL_PRD_SECTIONS } from "../components/chat/chat-revision";
import { ChatStreamStatus } from "../components/chat/chat-stream-status";
import { GenerationProgress } from "../components/generation-progress";
import { TableOfContents } from "../components/prd/table-of-contents";

afterEach(cleanup);

const listDefaults = {
	messages: [],
	isStreaming: true,
	streamingContent: "",
	currentSection: null,
	completedSections: [],
	isGeneratingPRD: false,
	isRevising: false,
};

describe("P5 shared loading contract", () => {
	it("renders one compact semantic status without fake steps or reasoning", () => {
		render(<GenerationProgress label="Acceptance Criteria" />);
		expect(screen.getAllByRole("status")).toHaveLength(1);
		expect(screen.getByText("Menyusun Acceptance Criteria...")).toBeTruthy();
		expect(document.body.textContent).not.toMatch(
			/berpikir|menganalisis|menulis dokumen|%|\d+s\b/i,
		);
	});

	it("uses the section checklist alone while PRD is generating before the first token", () => {
		render(
			<ChatMessageList
				{...listDefaults}
				isGeneratingPRD
				currentSection={ALL_PRD_SECTIONS[0]}
			/>,
		);
		expect(screen.getAllByRole("listitem")).toHaveLength(
			ALL_PRD_SECTIONS.length,
		);
		expect(screen.queryAllByRole("status")).toHaveLength(0);
		expect(document.body.textContent).not.toMatch(
			/AI sedang berpikir|Menganalisis kebutuhan|Menunggu balasan|\. \. \./i,
		);
	});

	it("gives non-document replies exactly one compact status", () => {
		render(<ChatMessageList {...listDefaults} />);
		expect(screen.getAllByRole("status")).toHaveLength(1);
		expect(screen.getByText("Menunggu balasan...")).toBeTruthy();
		expect(document.body.textContent).not.toMatch(/berpikir|reasoning/i);
	});

	it("replaces the checklist with one revision status while revising", () => {
		render(
			<ChatMessageList
				{...listDefaults}
				isGeneratingPRD
				isRevising
				currentSection={ALL_PRD_SECTIONS[0]}
			/>,
		);
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
		expect(screen.getAllByRole("status")).toHaveLength(1);
		expect(screen.getByText("Menyusun revisi...")).toBeTruthy();
	});

	it("keeps PRD status copy short and never declares completion on an incomplete stream", () => {
		const { container, rerender } = render(
			<ChatStreamStatus
				currentSection={ALL_PRD_SECTIONS[1]}
				completedSections={[ALL_PRD_SECTIONS[0]]}
				isGeneratingPRD
				isRevising={false}
			/>,
		);
		expect(screen.getByText("Menyusun PRD")).toBeTruthy();
		expect(document.body.textContent).not.toContain("PRD selesai");

		rerender(
			<ChatStreamStatus
				currentSection={null}
				completedSections={[ALL_PRD_SECTIONS[0]]}
				isGeneratingPRD={false}
				isRevising={false}
			/>,
		);
		expect(document.body.textContent).not.toContain("PRD selesai");

		rerender(
			<ChatStreamStatus
				currentSection={null}
				completedSections={[]}
				isGeneratingPRD={false}
				isRevising
			/>,
		);
		expect(container.innerHTML).toBe("");
	});
});

describe("P5 Acceptance Criteria document status", () => {
	it("shows one pre-token loader and no dummy TOC", () => {
		const { container } = render(
			<AcViewer
				content={null}
				streamingContent=""
				isStreaming
				projectName="Demo"
			/>,
		);
		expect(container.querySelectorAll('[role="status"], output')).toHaveLength(
			1,
		);
		expect(screen.getByText("Menyusun Acceptance Criteria...")).toBeTruthy();
		expect(container.querySelector("nav")).toBeNull();
		expect(document.body.textContent).not.toMatch(
			/menganalisis|berpikir|\d+\.\s/,
		);
	});

	it("replaces the loader with live content on the first token", () => {
		const { container, rerender } = render(
			<AcViewer
				content={null}
				streamingContent=""
				isStreaming
				projectName="Demo"
			/>,
		);
		rerender(
			<AcViewer
				content={null}
				streamingContent="## Kriteria 1\nGiven logical IM."
				isStreaming
				projectName="Demo"
			/>,
		);
		expect(screen.queryByText("Menyusun Acceptance Criteria...")).toBeNull();
		expect(container.textContent).toContain("Given logical IM.");
	});

	it("builds the TOC from real headings only", () => {
		const { container, rerender } = render(
			<TableOfContents content="" maxLevel={2} />,
		);
		expect(container.querySelector("nav")).toBeNull();
		rerender(
			<TableOfContents
				content={"## Kriteria Satu\nIsi\n## Kriteria Dua\nIsi\n### Sub-bagian"}
				maxLevel={2}
			/>,
		);
		const links = Array.from(container.querySelectorAll("a")).map((a) =>
			a.textContent?.trim(),
		);
		expect(links).toEqual(["Kriteria Satu", "Kriteria Dua"]);
	});
});
