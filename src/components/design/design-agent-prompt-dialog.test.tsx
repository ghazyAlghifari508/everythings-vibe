// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildDesignAgentPrompt,
	DesignAgentPromptDialog,
} from "./design-agent-prompt-dialog";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const PROPS = {
	siteName: "Acme",
	sourceUrl: "https://acme.example/",
	designMd: "# Acme - Style Reference\n\nBody here.",
};

describe("buildDesignAgentPrompt", () => {
	it("builds a deterministic handoff containing the URL and full DESIGN.md", () => {
		const prompt = buildDesignAgentPrompt(PROPS);
		expect(prompt).toContain("https://acme.example/");
		expect(prompt).toContain("# Acme - Style Reference");
		expect(prompt).toContain("Body here.");
		expect(buildDesignAgentPrompt(PROPS)).toBe(prompt);
	});

	it("contains no Greenfield project, CLI, or API-key content", () => {
		const prompt = buildDesignAgentPrompt(PROPS);
		expect(prompt).not.toMatch(/vibeeverything/i);
		expect(prompt).not.toMatch(/api[- ]key/i);
		expect(prompt).not.toMatch(/task (next|list|update)/i);
		expect(prompt).not.toMatch(/prd\/ac\/task/i);
	});
});

describe("DesignAgentPromptDialog", () => {
	it("opens with the handoff title, description, and prompt", () => {
		render(<DesignAgentPromptDialog open onOpenChange={() => {}} {...PROPS} />);
		expect(
			screen.getByRole("heading", { name: "Implement ke AI Agent" }),
		).toBeDefined();
		expect(screen.getByRole("dialog")).toBeDefined();
		const prompt = screen.getByLabelText(/prompt implementasi/i);
		expect((prompt as HTMLTextAreaElement).value).toContain(
			"https://acme.example/",
		);
		expect((prompt as HTMLTextAreaElement).value).toContain(
			"# Acme - Style Reference",
		);
	});

	it("copies the prompt and closes on confirmation", async () => {
		const writeText = vi.fn(async (_text: string) => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const onOpenChange = vi.fn();
		render(
			<DesignAgentPromptDialog open onOpenChange={onOpenChange} {...PROPS} />,
		);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /salin prompt/i }));
		});
		expect(writeText).toHaveBeenCalledTimes(1);
		expect(writeText.mock.calls[0]?.[0]).toContain("https://acme.example/");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("stays open when clipboard access fails", async () => {
		vi.stubGlobal("navigator", {
			clipboard: {
				writeText: vi.fn(async () => {
					throw new Error("denied");
				}),
			},
		});
		const onOpenChange = vi.fn();
		render(
			<DesignAgentPromptDialog open onOpenChange={onOpenChange} {...PROPS} />,
		);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /salin prompt/i }));
		});
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
