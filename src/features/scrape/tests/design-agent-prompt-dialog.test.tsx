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
} from "../components/design-agent-prompt-dialog";

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
		expect(prompt.split(PROPS.designMd)).toHaveLength(2);
		expect(prompt.endsWith(PROPS.designMd)).toBe(true);
		expect(buildDesignAgentPrompt(PROPS)).toBe(prompt);
	});

	it.each([
		"Personal work collection with project links",
		"Operational overview with existing data views",
	])("keeps product requirements outside the styling reference: %s", (brief) => {
		const designMd = `# Sample reference\r\n\r\n<!-- ${brief} -->\r\n`;
		const prompt = buildDesignAgentPrompt({ ...PROPS, designMd });
		const instructions = prompt.slice(0, -designMd.length);
		expect(prompt.split(designMd)).toHaveLength(2);
		expect(prompt.endsWith(designMd)).toBe(true);
		expect(instructions).toMatch(/konten.*fitur.*flow.*requirement/i);
		expect(instructions).toMatch(/styling.*bukan.*konten/i);
		expect(instructions).toMatch(/jangan.*struktur.*situs/i);
		expect(instructions).toMatch(/jangan.*palette.*inspector.*debug/i);
		expect(instructions).toMatch(/jangan.*logo.*trademark.*aset/i);
	});

	it("requires code-to-evidence mapping before scoped style overrides", () => {
		const prompt = buildDesignAgentPrompt(PROPS);
		expect(prompt).toMatch(/sebelum[\s\S]*codebase.*arsitektur styling/i);
		expect(prompt).toMatch(/baca DESIGN\.md.*lengkap/i);
		expect(prompt).toMatch(
			/petakan.*komponen.*file.*token.*evidence.*confidence/i,
		);
		expect(prompt).toMatch(
			/selama[\s\S]*observed.*mengungguli.*default.*konflik/i,
		);
		expect(prompt).toMatch(/hanya.*komponen.*state.*viewport.*cocok/i);
		expect(prompt).toMatch(/jangan.*global.*komponen lain/i);
		expect(prompt).toMatch(/reuse.*perubahan.*kecil/i);
	});

	it.each([
		"# Sample\n\nRadius: unknown\n",
		"# Sample\n\nRadius: conflicting observations\n",
		"# Sample\n\nAI enrichment: unavailable\n",
		"# Sample legacy\n\nColors only.\n",
	])("preserves incomplete evidence without manufacturing values: %s", (designMd) => {
		const prompt = buildDesignAgentPrompt({ ...PROPS, designMd });
		const instructions = prompt.slice(0, -designMd.length);
		expect(prompt.endsWith(designMd)).toBe(true);
		expect(instructions).toMatch(/unknown.*konflik.*legacy/i);
		expect(instructions).toMatch(
			/jangan.*mengarang.*nilai.*variant.*hover.*mobile/i,
		);
		expect(instructions).toMatch(
			/fallback.*enrichment.*bukan.*sintesis.*lengkap/i,
		);
		expect(instructions).toMatch(/inferred.*bukan.*observed/i);
		expect(instructions).not.toMatch(/#[\da-f]{3,8}\b|\b\d+(?:px|rem|em)\b/i);
	});

	it("requires an evidence-based compliance report, not a computed fidelity score", () => {
		const prompt = buildDesignAgentPrompt(PROPS);
		expect(prompt).toMatch(
			/sesudah[\s\S]*primary.*secondary.*input.*card.*navigation/i,
		);
		expect(prompt).toMatch(/sesudah[\s\S]*typography.*warna.*spacing/i);
		expect(prompt).toMatch(/implemented.*unapplied.*unknown/i);
		expect(prompt).toMatch(
			/aturan.*token.*file.*komponen.*verifikasi.*alasan/i,
		);
		expect(prompt).toMatch(/jangan.*skor.*persentase.*1:1/i);
		expect(prompt).toMatch(/laporan.*respons.*bukan.*UI/i);
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
