// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AdaptiveQuestion,
	CodebaseChatWorkspace,
} from "./codebase-chat-workspace";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

const baseProps = {
	featureName: "demo-repo",
	messages: [],
	questions: [],
	answers: {},
	artifacts: [],
};

const sampleQuestions: AdaptiveQuestion[] = [
	{
		id: "q1",
		title: "Bagaimana alur penyimpanan data untuk fitur ini?",
		options: [
			{ id: "q1-opt1", label: "Database relasional", recommended: true },
			{ id: "q1-opt2", label: "Penyimpanan lokal" },
		],
	},
	{
		id: "q2",
		title: "Bagaimana feedback UI saat aksi berhasil?",
		options: [
			{ id: "q2-opt1", label: "Toast notifikasi", recommended: true },
			{ id: "q2-opt2", label: "Indikator inline" },
		],
	},
];

function renderWorkspace(
	props: Partial<Parameters<typeof CodebaseChatWorkspace>[0]> = {},
) {
	act(() => {
		root?.render(<CodebaseChatWorkspace {...baseProps} {...props} />);
	});
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLTextAreaElement.prototype,
		"value",
	)?.set;
	setter?.call(textarea, value);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CodebaseChatWorkspace pristine standby", () => {
	it("shows clean centered pristine onboarding with single PromptBar and no duplicate composer", () => {
		renderWorkspace({
			codebaseName: "everythings-vibe",
			fileCount: 37,
		});

		const text = container.textContent ?? "";
		// 1. Heading renders "Apa yang ingin kamu bangun?"
		expect(text).toContain("Apa yang ingin kamu bangun?");
		// 2. Old "Halo!" copy is gone
		expect(text).not.toContain("Halo!");
		// 3. Supporting copy covers broad intent
		expect(text).toContain(
			"Jelaskan fitur, perubahan, atau masalah yang ingin kamu kerjakan.",
		);
		expect(text).toContain(
			"VibeEverything akan menyesuaikannya dengan struktur codebase ini.",
		);
		// 4. Context signal / pill is removed completely
		expect(
			container.querySelector("[data-testid='codebase-context-signal']"),
		).toBeNull();
		expect(text).not.toContain("Konteks repository siap");

		// 5. Header title uses neutral repository-centric format with subtitle
		const titleEl = container.querySelector(
			"[data-testid='codebase-chat-title']",
		);
		expect(titleEl?.textContent).toBe("Workspace · everythings-vibe");
		expect(text).toContain("Planning workspace");

		// 6. Pristine composition contains PromptBar
		expect(
			container.querySelector(
				"[data-testid='codebase-chat-pristine'] [data-testid='prompt-bar']",
			),
		).not.toBeNull();
		// 7. Exactly ONE PromptBar exists in DOM (no duplicate at bottom)
		expect(
			container.querySelectorAll("[data-testid='prompt-bar']"),
		).toHaveLength(1);
		// Active message container is NOT rendered during pristine
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).toBeNull();

		// 8. Composer placeholder
		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		expect(composer?.placeholder).toBe(
			"Jelaskan fitur atau perubahan yang kamu inginkan...",
		);
	});

	it("resolves provisional codebase name to neutral Workspace · Perencanaan codebase", () => {
		renderWorkspace({
			codebaseName: "Repository Lokal",
			featureName: "Repository Lokal",
		});

		const titleEl = container.querySelector(
			"[data-testid='codebase-chat-title']",
		);
		expect(titleEl?.textContent).toBe("Workspace · Perencanaan codebase");
		expect(container.textContent).not.toContain("Repository Lokal");
	});

	it("prefills draft from starter suggestion without auto-sending", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({
			starterSuggestions: ["Tambah filter genre", "Perbaiki cache film"],
			onSendMessage,
		});

		const suggestionsContainer = container.querySelector(
			"[data-testid='codebase-starter-suggestions']",
		);
		expect(suggestionsContainer).not.toBeNull();
		const buttons = suggestionsContainer?.querySelectorAll("button");
		expect(buttons).toHaveLength(2);
		expect(buttons?.[0]?.textContent).toBe("Tambah filter genre");

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		expect(composer?.value).toBe("");

		// Click suggestion
		act(() => {
			buttons?.[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Draft is prefilled
		expect(composer?.value).toBe("Tambah filter genre");
		// Crucial: NOT auto-submitted
		expect(onSendMessage).not.toHaveBeenCalled();
	});

	it("omits starter suggestions container when none provided", () => {
		renderWorkspace();
		expect(
			container.querySelector("[data-testid='codebase-starter-suggestions']"),
		).toBeNull();
	});

	it("renders generic intent starters in pristine mode with 4 shortcuts", () => {
		renderWorkspace();

		const startersContainer = container.querySelector(
			"[data-testid='codebase-intent-starters']",
		);
		expect(startersContainer).not.toBeNull();
		expect(startersContainer?.textContent).toContain("Mulai dari");

		expect(
			container.querySelector("[data-testid='intent-starter-feature']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='intent-starter-bugfix']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='intent-starter-refactor']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='intent-starter-ui']"),
		).not.toBeNull();

		expect(startersContainer?.textContent).toContain("Tambah fitur baru");
		expect(startersContainer?.textContent).toContain("Perbaiki bug atau alur");
		expect(startersContainer?.textContent).toContain("Refactor kode");
		expect(startersContainer?.textContent).toContain("Improve UI");
	});

	it("prefills composer draft from intent starter shortcut without calling onSendMessage", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({ onSendMessage });

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		expect(composer?.value).toBe("");

		const featureBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='intent-starter-feature']",
		);
		expect(featureBtn).not.toBeNull();

		act(() => {
			featureBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(composer?.value).toBe("Tambahkan fitur ");
		expect(onSendMessage).not.toHaveBeenCalled();
	});

	it("does not render intent starters or context eyebrow once conversation is active", () => {
		renderWorkspace({
			messages: [{ id: "m1", role: "user", content: "Halo dari user" }],
		});

		expect(
			container.querySelector("[data-testid='codebase-intent-starters']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-context-signal']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
	});

	it("exits pristine state when questionsLoading is true", () => {
		renderWorkspace({ questionsLoading: true });
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-questions-loading']"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-testid='prompt-bar']"),
		).toHaveLength(1);
	});

	it("exits pristine state when questions are present", () => {
		renderWorkspace({ questions: sampleQuestions });
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='adaptive-question-q1']"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-testid='prompt-bar']"),
		).toHaveLength(1);
	});

	it("exits pristine state when artifacts are present or stage progresses", () => {
		renderWorkspace({
			artifacts: [
				{
					id: "art-1",
					fileName: "prd-spec.md",
					fileSizeBytes: 1024,
					badge: "PRD",
					description: "Dokumen spesifikasi PRD",
				},
			],
		});
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-testid='prompt-bar']"),
		).toHaveLength(1);

		// Stage progresses to "prd"
		renderWorkspace({ stage: "prd" });
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
	});

	it("keeps Kirim disabled until a valid feature message is typed", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({ onSendMessage });

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const sendButton = [...container.querySelectorAll("button")].find((b) =>
			/Kirim/.test(b.textContent ?? ""),
		);
		expect(sendButton?.disabled).toBe(true);

		act(() => {
			if (composer) setTextareaValue(composer, "ab");
		});
		expect(sendButton?.disabled).toBe(true);

		act(() => {
			if (composer) setTextareaValue(composer, "Tambah mode gelap");
		});
		expect(sendButton?.disabled).toBe(false);

		act(() => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSendMessage).toHaveBeenCalledWith("Tambah mode gelap");
		expect(composer?.value).toBe("");
	});

	it("renders PromptBar primitive and sends on Enter but not Shift+Enter", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({ onSendMessage });

		expect(
			container.querySelector("[data-testid='prompt-bar']"),
		).not.toBeNull();
		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);

		act(() => {
			if (composer) setTextareaValue(composer, "Baris satu");
		});

		// Shift+Enter does not trigger onSendMessage
		act(() => {
			composer?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					shiftKey: true,
					bubbles: true,
				}),
			);
		});
		expect(onSendMessage).not.toHaveBeenCalled();

		// Enter sends
		act(() => {
			composer?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					shiftKey: false,
					bubbles: true,
				}),
			);
		});
		expect(onSendMessage).toHaveBeenCalledWith("Baris satu");
		expect(composer?.value).toBe("");
	});

	it("blocks sending and disables composer during questionsLoading or isSending", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({
			questionsLoading: true,
			onSendMessage,
		});

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const sendButton = [...container.querySelectorAll("button")].find((b) =>
			/Kirim|Mengirim/.test(b.textContent ?? ""),
		);

		expect(composer?.disabled).toBe(true);
		expect(sendButton?.disabled).toBe(true);

		// Now render with isSending
		renderWorkspace({
			isSending: true,
			onSendMessage,
		});

		const isSendingComposer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const isSendingButton = [...container.querySelectorAll("button")].find(
			(b) => /Kirim|Mengirim/.test(b.textContent ?? ""),
		);
		expect(isSendingComposer?.disabled).toBe(true);
		expect(isSendingButton?.disabled).toBe(true);
		expect(isSendingButton?.textContent).toContain("Mengirim...");
	});

	it("does not render fake demo controls in codebase chat workspace", () => {
		renderWorkspace();

		expect(container.querySelector('[aria-label="Choose model"]')).toBeNull();
		expect(container.querySelector('[aria-label="Dictate"]')).toBeNull();
		expect(container.querySelector('[aria-label="Add files"]')).toBeNull();
		expect(container.querySelector('[role="slider"]')).toBeNull();
		expect(container.querySelector("canvas")).toBeNull();
	});

	it("shows the kanban badge only when live progress exists", () => {
		renderWorkspace({
			kanbanProgress: { done: 2, total: 5, pct: 40 },
		});

		const badge = container.querySelector(
			"[data-testid='codebase-kanban-badge']",
		);
		expect(badge?.textContent).toContain("Kanban Live: 2/5 Selesai (40%)");
	});

	it("renders user messages in the stream", () => {
		renderWorkspace({
			messages: [{ id: "u1", role: "user", content: "Tambah mode gelap" }],
		});

		expect(container.textContent).toContain("Tambah mode gelap");
		expect(container.textContent).not.toContain("Apa yang ingin kamu bangun?");
		expect(container.textContent).not.toContain("Halo!");
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-testid='prompt-bar']"),
		).toHaveLength(1);
	});
});

describe("CodebaseChatWorkspace one-by-one questions", () => {
	it("reveals only the first unanswered question", () => {
		renderWorkspace({ questions: sampleQuestions, answers: {} });

		expect(
			container.querySelector("[data-testid='adaptive-question-q1']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='adaptive-question-q2']"),
		).toBeNull();
		expect(container.textContent).toContain("Rekomendasi");
	});

	it("requires a selection before Kirim Jawaban activates", () => {
		const onSubmitAnswer = vi.fn();
		renderWorkspace({
			questions: sampleQuestions,
			answers: {},
			onSubmitAnswer,
		});

		const card = container.querySelector(
			"[data-testid='adaptive-question-q1']",
		);
		const submit = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
			/Kirim Jawaban/.test(b.textContent ?? ""),
		);
		expect(submit?.disabled).toBe(true);

		const firstOption = [...(card?.querySelectorAll("button") ?? [])].find(
			(b) => (b.textContent ?? "").includes("Database relasional"),
		);
		act(() => {
			firstOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(submit?.disabled).toBe(false);

		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSubmitAnswer).toHaveBeenCalledWith("q1", "Database relasional");
	});

	it("advances to the next question after answering and supports Lainnya", () => {
		const onSubmitAnswer = vi.fn();
		renderWorkspace({
			questions: sampleQuestions,
			answers: { q1: "Database relasional" },
			onSubmitAnswer,
		});

		const q1 = container.querySelector("[data-testid='adaptive-question-q1']");
		expect(q1?.textContent).toContain("Jawaban: Database relasional");
		expect(
			container.querySelector("[data-testid='adaptive-question-q2']"),
		).not.toBeNull();

		const q2 = container.querySelector("[data-testid='adaptive-question-q2']");
		const lainnya = [...(q2?.querySelectorAll("button") ?? [])].find((b) =>
			/Lainnya/.test(b.textContent ?? ""),
		);
		act(() => {
			lainnya?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const customInput = q2?.querySelector<HTMLInputElement>("#custom-q2");
		expect(customInput).not.toBeNull();
		act(() => {
			if (customInput) {
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(customInput, "Banner kilat");
				customInput.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		const submit = [...(q2?.querySelectorAll("button") ?? [])].find((b) =>
			/Kirim Jawaban/.test(b.textContent ?? ""),
		);
		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSubmitAnswer).toHaveBeenCalledWith("q2", "Banner kilat");
	});
});

describe("CodebaseChatWorkspace confirmation and spec errors", () => {
	const completeAnswers = { q1: "Database relasional", q2: "Toast notifikasi" };

	it("shows confirmation with Lanjut Bikin Fitur when all answered", () => {
		const onConfirmGenerate = vi.fn();
		renderWorkspace({
			questions: sampleQuestions,
			answers: completeAnswers,
			stage: "questions",
			onConfirmGenerate,
		});

		const complete = container.querySelector(
			"[data-testid='codebase-questions-complete']",
		);
		expect(complete).not.toBeNull();
		expect(complete?.textContent).toContain(
			"Pertanyaan sudah dijawab semua dan informasi kebutuhan sudah lengkap. Siap membuat spesifikasi fitur?",
		);

		const cta = [...(complete?.querySelectorAll("button") ?? [])].find((b) =>
			/Lanjut Bikin Fitur/.test(b.textContent ?? ""),
		);
		act(() => {
			cta?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onConfirmGenerate).toHaveBeenCalledTimes(1);
	});

	it("hides Lanjut Bikin Fitur once the pipeline advances past questions", () => {
		renderWorkspace({
			questions: sampleQuestions,
			answers: completeAnswers,
			stage: "feature",
			onConfirmGenerate: vi.fn(),
		});

		expect(
			container.querySelector("[data-testid='codebase-questions-complete']"),
		).toBeNull();
	});

	it("shows busy state on the CTA while generating", () => {
		renderWorkspace({
			questions: sampleQuestions,
			answers: completeAnswers,
			isConfirming: true,
		});

		const cta = [...container.querySelectorAll("button")].find((b) =>
			/Membuat spesifikasi/.test(b.textContent ?? ""),
		);
		expect(cta?.disabled).toBe(true);
	});

	it("renders spec errors with a retry action", () => {
		const onRetryGenerate = vi.fn();
		renderWorkspace({
			questions: sampleQuestions,
			answers: completeAnswers,
			specError: "Spesifikasi fitur gagal dibuat. Coba lagi.",
			onRetryGenerate,
		});

		const alert = container.querySelector(
			"[data-testid='codebase-spec-error']",
		);
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain(
			"Spesifikasi fitur gagal dibuat. Coba lagi.",
		);

		const retry = [...(alert?.querySelectorAll("button") ?? [])].find((b) =>
			/Coba lagi/.test(b.textContent ?? ""),
		);
		act(() => {
			retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetryGenerate).toHaveBeenCalledTimes(1);
	});
});

describe("CodebaseChatWorkspace artifacts", () => {
	it("renders FileCards and opens them in the canvas", () => {
		const onOpenArtifact = vi.fn();
		renderWorkspace({
			artifacts: [
				{
					id: "feature-abc",
					fileName: "feature-mode-gelap.json",
					fileSizeBytes: null,
					badge: "FITUR",
					description: "Spesifikasi fitur Mode gelap",
				},
			],
			onOpenArtifact,
		});

		expect(container.textContent).toContain("feature-mode-gelap.json");
		const openButton = container.querySelector<HTMLButtonElement>(
			'[aria-label="Buka preview feature-mode-gelap.json"]',
		);
		act(() => {
			openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onOpenArtifact).toHaveBeenCalledTimes(1);
		expect(onOpenArtifact.mock.calls[0]?.[0]).toMatchObject({
			id: "feature-abc",
		});
	});

	it("does not render handoff card or FileCards during question flow", () => {
		renderWorkspace({
			questions: sampleQuestions,
			answers: { q1: "Database relasional" },
			artifacts: [],
			projectIdForHandoff: null,
		});

		expect(
			container.querySelector("[data-testid='codebase-handoff-card']"),
		).toBeNull();
		expect(container.textContent).not.toContain("Handoff ke AI Coding Agent");
		expect(container.textContent).not.toContain(".json");
	});

	it("renders handoff card when projectIdForHandoff is provided", () => {
		renderWorkspace({
			projectIdForHandoff: "proj-123",
		});

		expect(
			container.querySelector("[data-testid='codebase-handoff-card']"),
		).not.toBeNull();
		expect(container.textContent).toContain(
			"npx vibeeverything export rules proj-123",
		);
	});

	it("renders sleek transparent composer container", () => {
		renderWorkspace();

		const composer = container.querySelector("#codebase-chat-composer");
		expect(composer).not.toBeNull();
		const composerWrapper = composer?.closest(".shrink-0");
		expect(composerWrapper?.className).toContain("bg-transparent");
		expect(composerWrapper?.className).not.toContain("bg-charcoal");
	});
});

describe("CodebaseChatWorkspace pipeline stages", () => {
	it("offers Lanjut Buat PRD only at the feature stage", () => {
		const onGeneratePrd = vi.fn();
		renderWorkspace({ stage: "feature", onGeneratePrd });

		const cta = container.querySelector("[data-testid='codebase-stage-prd']");
		expect(cta).not.toBeNull();
		expect(cta?.textContent).toContain(
			"Fitur berhasil disusun. Lanjut susun PRD 8 seksi?",
		);

		const button = [...(cta?.querySelectorAll("button") ?? [])].find((b) =>
			/Lanjut Buat PRD/.test(b.textContent ?? ""),
		);
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onGeneratePrd).toHaveBeenCalledTimes(1);
	});

	it("hides the PRD CTA at other stages", () => {
		renderWorkspace({ stage: "prd", onGeneratePrd: vi.fn() });
		expect(
			container.querySelector("[data-testid='codebase-stage-prd']"),
		).toBeNull();
	});

	it("offers Lanjut Buat AC at the prd stage with busy state", () => {
		renderWorkspace({
			stage: "prd",
			stageBusy: "ac",
			onGenerateAc: vi.fn(),
		});

		const cta = container.querySelector("[data-testid='codebase-stage-ac']");
		expect(cta).not.toBeNull();
		expect(cta?.textContent).toContain(
			"PRD siap. Lanjut generate Acceptance Criteria (AC)?",
		);
		const button = [...(cta?.querySelectorAll("button") ?? [])].find((b) =>
			/Membuat AC/.test(b.textContent ?? ""),
		);
		expect(button?.disabled).toBe(true);
	});

	it("offers Lanjut Breakdown Task at the ac stage", () => {
		const onGenerateTask = vi.fn();
		renderWorkspace({ stage: "ac", onGenerateTask });

		const cta = container.querySelector("[data-testid='codebase-stage-task']");
		expect(cta).not.toBeNull();
		expect(cta?.textContent).toContain(
			"Acceptance Criteria siap. Lanjut breakdown Task & Papan Kanban?",
		);

		const button = [...(cta?.querySelectorAll("button") ?? [])].find((b) =>
			/Lanjut Breakdown Task/.test(b.textContent ?? ""),
		);
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onGenerateTask).toHaveBeenCalledTimes(1);
	});

	it("renders stage errors with retry", () => {
		const onRetryStage = vi.fn();
		renderWorkspace({
			stage: "prd",
			stageError: "Generate AC hanya tersedia di paket Pro dan Hengker.",
			onRetryStage,
		});

		const alert = container.querySelector(
			"[data-testid='codebase-stage-error']",
		);
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain(
			"Generate AC hanya tersedia di paket Pro dan Hengker.",
		);

		const retry = [...(alert?.querySelectorAll("button") ?? [])].find((b) =>
			/Coba lagi/.test(b.textContent ?? ""),
		);
		act(() => {
			retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetryStage).toHaveBeenCalledTimes(1);
	});

	it("renders the comprehensive handoff with both CLI commands", () => {
		renderWorkspace({ projectIdForHandoff: "proj-123" });

		const card = container.querySelector(
			"[data-testid='codebase-handoff-card']",
		);
		expect(card).not.toBeNull();
		expect(card?.textContent).toContain(
			"npx vibeeverything export rules proj-123",
		);
		expect(card?.textContent).toContain(
			"npx vibeeverything task next proj-123",
		);
		expect(card?.textContent).toContain("polling");
	});
});
