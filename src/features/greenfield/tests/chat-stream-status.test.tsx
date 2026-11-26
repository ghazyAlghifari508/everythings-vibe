// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ALL_PRD_SECTIONS } from "../components/chat/chat-revision";
import { ChatStreamStatus } from "../components/chat/chat-stream-status";

afterEach(cleanup);

it("lists all sections with distinct completed/current/pending status and no green", () => {
	const [done, current, pending] = ALL_PRD_SECTIONS;
	const { container } = render(
		<ChatStreamStatus
			currentSection={current}
			completedSections={[done]}
			isGeneratingPRD
			isRevising={false}
		/>,
	);
	expect(screen.getAllByRole("listitem")).toHaveLength(ALL_PRD_SECTIONS.length);
	const byName = (name: string) =>
		screen
			.getAllByRole("listitem")
			.find((li) => li.textContent?.includes(name));
	expect(byName(done)?.textContent).toContain("(selesai)");
	expect(byName(current)?.textContent).toContain("(sedang diproses)");
	expect(byName(current)?.getAttribute("aria-current")).toBe("step");
	expect(byName(pending)?.textContent).toContain("(menunggu)");
	expect(container.innerHTML.includes("emerald")).toBe(false);
});

it("shows a plain completion heading without emoji when all sections are done", () => {
	render(
		<ChatStreamStatus
			currentSection={null}
			completedSections={[...ALL_PRD_SECTIONS]}
			isGeneratingPRD={false}
			isRevising={false}
		/>,
	);
	expect(screen.getByText("PRD selesai")).toBeTruthy();
	expect(document.body.textContent).not.toContain("✅");
});
