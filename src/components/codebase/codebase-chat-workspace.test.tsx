// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodebaseStarterSuggestion } from "@/lib/codebase-analysis";
import {
	CODEBASE_STAGE_ACTIVITY,
	settleRun,
	startRun,
} from "@/lib/codebase-chat-flow";
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
		type: "select",
		options: [
			{ id: "q1-opt1", label: "Database relasional", recommended: true },
			{ id: "q1-opt2", label: "Penyimpanan lokal" },
		],
		recommendedOptionId: "q1-opt1",
		recommendationReason: "Repo memakai penyimpanan lokal untuk preferensi.",
	},
	{
		id: "q2",
		title: "Bagaimana feedback UI saat aksi berhasil?",
		type: "select",
		options: [
			{ id: "q2-opt1", label: "Toast notifikasi", recommended: true },
			{ id: "q2-opt2", label: "Indikator inline" },
		],
	},
];

const typedQuestions: AdaptiveQuestion[] = [
	{
		id: "t1",
		title: "Permukaan UI mana yang terpengaruh?",
		type: "multiselect",
		options: [
			{ id: "t1-opt1", label: "Kartu film" },
			{ id: "t1-opt2", label: "Halaman detail" },
		],
	},
	{
		id: "t2",
		title: "Ada catatan tambahan?",
		type: "text",
		options: [],
	},
];

const starterSuggestions: CodebaseStarterSuggestion[] = [
	{
		id: "feature",
		title: "Tambah ekspor ringkasan",
		description: "Ekspor hasil ringkasan yang dibuat di aplikasi.",
		prompt:
			"Tambahkan opsi ekspor untuk ringkasan yang dibuat di aplikasi ini. Gunakan pola komponen dan alur data yang terlihat di repository.",
		relevantPaths: ["src/features/summary.tsx"],
	},
	{
		id: "bugfix",
		title: "Perbaiki validasi unggahan",
		description: "Tinjau feedback ketika berkas tidak lolos validasi.",
		prompt:
			"Periksa alur validasi unggahan pada modul yang relevan dan rapikan penanganan kegagalan tanpa mengubah perilaku valid yang sudah ada.",
		relevantPaths: ["src/features/upload.ts"],
	},
	{
		id: "refactor",
		title: "Pisahkan parsing konfigurasi",
		description: "Pisahkan parsing dari komponen yang menggunakannya.",
		prompt:
			"Refactor parsing konfigurasi agar terpisah dari komponen pemakainya, mengikuti pembagian tanggung jawab yang sudah terlihat dan mempertahankan perilaku saat ini.",
		relevantPaths: ["src/config/parse.ts"],
	},
	{
		id: "ui",
		title: "Perjelas status formulir",
		description: "Rapikan hierarki status pada formulir yang ada.",
		prompt:
			"Perjelas hierarchy status loading, success, dan error pada formulir yang ada dengan mengikuti komponen dan token responsive yang sudah digunakan di repository.",
		relevantPaths: ["src/components/forms/editor.tsx"],
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

		// 8. Composer placeholder names a new feature while nothing exists
		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		expect(composer?.placeholder).toBe(
			"Jelaskan fitur baru yang kamu inginkan...",
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

	it("never presents a feature plan name as the repository identity", () => {
		// A feature title is not repository identity. When the repository name
		// is unavailable the header must stay neutral instead of borrowing the
		// plan's name, which would present a feature as the repository.
		renderWorkspace({
			codebaseName: "Repository Lokal",
			featureName: "Sistem Checkout Billing",
		});

		const titleEl = container.querySelector(
			"[data-testid='codebase-chat-title']",
		);
		expect(titleEl?.textContent).toBe("Workspace · Perencanaan codebase");
		expect(titleEl?.textContent).not.toContain("Sistem Checkout Billing");
	});

	it("keeps the starter cards and reports a newer failed attempt beside them", () => {
		renderWorkspace({
			starterSuggestions,
			newerAttemptFailure: { errorMessage: "Model timeout" },
		});

		const notice = container.querySelector(
			"[data-testid='codebase-newer-attempt-failed']",
		);
		expect(notice?.textContent).toContain("Analisis terbaru gagal");
		expect(notice?.textContent).toContain("Model timeout");
		expect(
			container.querySelectorAll(
				"[data-testid='codebase-intent-starters'] button",
			),
		).toHaveLength(4);
	});

	it("shows no failure notice when the newest attempt did not fail", () => {
		renderWorkspace({ starterSuggestions, newerAttemptFailure: null });
		expect(
			container.querySelector("[data-testid='codebase-newer-attempt-failed']"),
		).toBeNull();
	});

	it("renders exactly the supplied repository-aware starters in one section", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({
			starterSuggestions,
			onSendMessage,
		});

		const startersContainer = container.querySelector(
			"[data-testid='codebase-intent-starters']",
		);
		expect(startersContainer).not.toBeNull();
		expect(startersContainer?.textContent).toContain("Mulai dari");
		expect(startersContainer?.querySelectorAll("button")).toHaveLength(4);
		expect(
			container.querySelectorAll("[data-testid='codebase-intent-starters']"),
		).toHaveLength(1);
		for (const suggestion of starterSuggestions) {
			expect(startersContainer?.textContent).toContain(suggestion.title);
			expect(startersContainer?.textContent).toContain(suggestion.description);
		}
		expect(container.textContent).not.toContain("Tambah fitur baru");
		expect(container.textContent).not.toContain("Tambahkan fitur ");
		expect(container.textContent).not.toContain("Perbaiki bug atau alur pada ");
		expect(container.textContent).not.toContain("Refactor bagian ");
		expect(container.textContent).not.toContain("Improve UI pada ");
		expect(
			container.querySelector("[data-testid='codebase-starter-suggestions']"),
		).toBeNull();
		expect(onSendMessage).not.toHaveBeenCalled();
	});

	it("prefills the complete prompt, focuses the composer, and does not auto-send", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({ starterSuggestions, onSendMessage });

		const buttons = container.querySelectorAll<HTMLButtonElement>(
			"[data-testid='codebase-intent-starters'] button",
		);
		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const featureSuggestion = starterSuggestions[0];
		const featureButton = buttons[0];
		expect(featureButton?.textContent).toContain(featureSuggestion?.title);
		expect(composer).not.toBeNull();

		act(() => {
			featureButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(composer?.value).toBe(featureSuggestion?.prompt);
		expect(document.activeElement).toBe(composer);
		expect(composer?.selectionStart).toBe(featureSuggestion?.prompt.length);
		expect(composer?.selectionEnd).toBe(featureSuggestion?.prompt.length);
		expect(onSendMessage).not.toHaveBeenCalled();
	});

	it("keeps starter cards keyboard-focusable buttons", () => {
		renderWorkspace({ starterSuggestions });

		const buttons = container.querySelectorAll<HTMLButtonElement>(
			"[data-testid='codebase-intent-starters'] button",
		);
		for (const button of buttons) {
			expect(button.type).toBe("button");
			expect(button.disabled).toBe(false);
		}
	});

	it("hides the entire starter section when legacy analysis has no suggestions", () => {
		renderWorkspace();
		expect(
			container.querySelector("[data-testid='codebase-intent-starters']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-starter-suggestions']"),
		).toBeNull();
	});

	it("hides starters unless persisted suggestions contain all four unique categories", () => {
		renderWorkspace({
			starterSuggestions: [
				starterSuggestions[0],
				starterSuggestions[1],
				starterSuggestions[2],
				{ ...starterSuggestions[3], id: "feature" },
			],
		});

		expect(
			container.querySelector("[data-testid='codebase-intent-starters']"),
		).toBeNull();
	});
	it("offers an explicit persisted-analysis refresh for legacy starterless output", () => {
		const onRefreshStarterSuggestions = vi.fn();
		const onSendMessage = vi.fn();
		renderWorkspace({
			starterRefresh: {
				analysisId: "analysis-legacy",
				snapshotId: "snapshot-current",
				status: "ready",
			},
			onRefreshStarterSuggestions,
			onSendMessage,
		});
		expect(
			container.querySelector("[data-testid='codebase-intent-starters']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='intent-starter-feature']"),
		).toBeNull();
		expect(
			container.querySelector<HTMLTextAreaElement>("#codebase-chat-composer")
				?.disabled,
		).toBe(false);
		const refreshButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-refresh-starters']",
		);
		expect(refreshButton).not.toBeNull();
		act(() => {
			refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(onRefreshStarterSuggestions).toHaveBeenCalledWith(
			"analysis-legacy",
			"snapshot-current",
		);
		expect(onSendMessage).not.toHaveBeenCalled();
	});
	it("disables the refresh action while the persisted refresh request is pending", () => {
		renderWorkspace({
			starterRefresh: {
				analysisId: "analysis-legacy",
				snapshotId: "snapshot-current",
				status: "ready",
				isRefreshing: true,
			},
			onRefreshStarterSuggestions: vi.fn(),
		});

		const refreshButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-refresh-starters']",
		);
		expect(refreshButton?.disabled).toBe(true);
		expect(refreshButton?.getAttribute("aria-busy")).toBe("true");
	});

	it("does not offer refresh for pending or failed persisted analysis", () => {
		for (const status of ["pending", "failed"] as const) {
			renderWorkspace({
				starterRefresh: {
					analysisId: "analysis-legacy",
					snapshotId: "snapshot-current",
					status,
				},
			});
			expect(
				container.querySelector("[data-testid='codebase-refresh-starters']"),
			).toBeNull();
		}
	});

	it("shows refresh errors and lets the user retry explicitly", () => {
		const onRefreshStarterSuggestions = vi.fn();
		renderWorkspace({
			starterRefresh: {
				analysisId: "analysis-legacy",
				snapshotId: "snapshot-current",
				status: "ready",
				error: "Pembaruan saran gagal.",
			},
			onRefreshStarterSuggestions,
		});

		const error = container.querySelector("[role='alert']");
		expect(error?.textContent).toContain("Pembaruan saran gagal.");
		const retryButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-refresh-starters']",
		);
		expect(retryButton?.disabled).toBe(false);
		act(() => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRefreshStarterSuggestions).toHaveBeenCalledWith(
			"analysis-legacy",
			"snapshot-current",
		);
	});

	it("keeps refreshed persisted cards and prompts stable across rerenders", () => {
		const refreshedSuggestions = starterSuggestions.map((suggestion) => ({
			...suggestion,
			title: `Updated ${suggestion.title}`,
			prompt: `Updated prompt: ${suggestion.prompt}`,
		}));
		renderWorkspace({ starterSuggestions });
		renderWorkspace({ starterSuggestions: refreshedSuggestions });

		const featureButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='intent-starter-feature']",
		);
		expect(featureButton?.textContent).toContain(
			refreshedSuggestions[0]?.title,
		);
		act(() => {
			featureButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(
			container.querySelector<HTMLTextAreaElement>("#codebase-chat-composer")
				?.value,
		).toBe(refreshedSuggestions[0]?.prompt);
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

	it("exits pristine state while a question run is in flight", () => {
		renderWorkspace({ run: startRun("questions", Date.now()) });
		expect(
			container.querySelector("[data-testid='codebase-chat-pristine']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-chat-messages']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-run-thinking']"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-testid='prompt-bar']"),
		).toHaveLength(1);
	});

	it("shows genuine thinking activity with elapsed time, never skeleton bars", () => {
		renderWorkspace({ run: startRun("questions", Date.now() - 1500) });
		const thinking = container.querySelector(
			"[data-testid='codebase-run-thinking']",
		);
		expect(thinking).not.toBeNull();
		// The old placeholder is gone: no skeleton bars may remain.
		expect(
			container.querySelector("[data-testid='codebase-questions-loading']"),
		).toBeNull();
		expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
		// The real activity line for this stage, plus a real elapsed timer.
		expect(thinking?.textContent).toContain("Menyusun pertanyaan klarifikasi");
		expect(thinking?.textContent).toContain(CODEBASE_STAGE_ACTIVITY.questions);
		const timer = thinking?.querySelector("[role='timer']");
		expect(timer).not.toBeNull();
		expect(timer?.textContent).toMatch(/^\d+\.\d+s$/);
	});

	it("renders exactly one thinking surface for the active run", () => {
		renderWorkspace({ run: startRun("questions", Date.now()) });
		expect(
			container.querySelectorAll("[data-testid='codebase-run-thinking']"),
		).toHaveLength(1);
	});

	it("shows the failed state with the server error and a safe retry", () => {
		const onRetryQuestions = vi.fn();
		renderWorkspace({
			run: settleRun(
				startRun("questions", Date.now() - 2000),
				"failed",
				Date.now(),
				"Konteks repositori belum siap.",
			),
			onRetryQuestions,
		});
		const thinking = container.querySelector(
			"[data-testid='codebase-run-thinking']",
		);
		expect(thinking?.textContent).toContain("Gagal menyusun");
		const error = container.querySelector(
			"[data-testid='codebase-questions-error']",
		);
		expect(error?.textContent).toContain("Konteks repositori belum siap.");
		const retry = [...(error?.querySelectorAll("button") ?? [])].find((b) =>
			/Coba lagi/.test(b.textContent ?? ""),
		);
		act(() => {
			retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetryQuestions).toHaveBeenCalledTimes(1);
	});

	it("settles into the done state with the real measured duration", () => {
		renderWorkspace({
			run: settleRun(startRun("prd", 1_000), "done", 19_400),
		});
		const thinking = container.querySelector(
			"[data-testid='codebase-run-thinking']",
		);
		expect(thinking?.textContent).toContain("PRD selesai");
		expect(thinking?.textContent).toContain("18.4s");
	});

	it("places the thinking line directly below the user message", () => {
		renderWorkspace({
			messages: [{ id: "user-1", role: "user", content: "Tambah mode gelap" }],
			run: startRun("questions", Date.now()),
		});
		const stream = container.querySelector(
			"[data-testid='codebase-chat-messages']",
		);
		const children = Array.from(stream?.firstElementChild?.children ?? []);
		const userIndex = children.findIndex((child) =>
			child.textContent?.includes("Tambah mode gelap"),
		);
		const thinkingIndex = children.findIndex(
			(child) =>
				child.querySelector("[data-testid='codebase-run-thinking']") !== null ||
				child.getAttribute("data-testid") === "codebase-run-thinking",
		);
		expect(userIndex).toBeGreaterThanOrEqual(0);
		expect(thinkingIndex).toBeGreaterThan(userIndex);
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
		const sendButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
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
		expect(onSendMessage).toHaveBeenCalledTimes(1);
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

	it("blocks sending while busy but keeps the composer editable and the draft intact", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({
			run: startRun("questions", Date.now()),
			onSendMessage,
		});

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const sendButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
		);

		// Editable: the user can prepare the next message while AI works.
		expect(composer?.disabled).toBe(false);
		// Submit closed, and Enter must not bypass the pending-request guard.
		expect(sendButton?.disabled).toBe(true);
		act(() => {
			if (composer) setTextareaValue(composer, "Draft baru");
		});
		expect(composer?.value).toBe("Draft baru");
		act(() => {
			composer?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					bubbles: true,
				}),
			);
		});
		expect(onSendMessage).not.toHaveBeenCalled();

		// Now render with isSending
		renderWorkspace({
			isSending: true,
			onSendMessage,
		});

		const isSendingComposer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const isSendingButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
		);
		expect(isSendingComposer?.disabled).toBe(false);
		expect(isSendingButton?.disabled).toBe(true);
		// Icon-only submit carries its state through ARIA, never visible text.
		expect(isSendingButton?.getAttribute("aria-busy")).toBe("true");
		expect(isSendingButton?.textContent).toBe("");
	});

	it("focuses the textarea when any empty composer region is pressed", () => {
		renderWorkspace();

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const surface = container.querySelector("[data-testid='prompt-bar']");
		const footer = surface?.querySelector(":scope > div");
		expect(surface).not.toBeNull();
		expect(footer).not.toBeNull();

		// Lower empty area (footer row), container padding, and the surface
		// itself must all start typing.
		for (const region of [footer, surface]) {
			act(() => {
				composer?.blur();
				const press = new MouseEvent("mousedown", {
					bubbles: true,
					cancelable: true,
				});
				region?.dispatchEvent(press);
				expect(press.defaultPrevented).toBe(true);
			});
			expect(document.activeElement).toBe(composer);
		}
	});

	it("leaves textarea and submit interactions to their native handlers", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({ onSendMessage });

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const submit = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
		);

		act(() => {
			if (composer) setTextareaValue(composer, "Tambah pencarian proyek");
		});

		// Pressing inside the textarea must not be intercepted, or caret
		// placement and drag-selection would break.
		act(() => {
			const press = new MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
			});
			composer?.dispatchEvent(press);
			expect(press.defaultPrevented).toBe(false);
		});

		// Pressing the submit must not be intercepted, or the click that
		// follows would be swallowed by the surface handler.
		act(() => {
			const press = new MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
			});
			submit?.dispatchEvent(press);
			expect(press.defaultPrevented).toBe(false);
		});
		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSendMessage).toHaveBeenCalledTimes(1);
		expect(onSendMessage).toHaveBeenCalledWith("Tambah pencarian proyek");
	});

	it("places the caret at the end of the prefilled prompt when the empty area is pressed", () => {
		renderWorkspace({
			starterSuggestions,
		});

		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		const startCard = container.querySelector<HTMLButtonElement>(
			"[data-testid='intent-starter-feature']",
		);
		act(() => {
			startCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(composer?.value).toContain("ekspor");

		const footer = container
			.querySelector("[data-testid='prompt-bar']")
			?.querySelector(":scope > div");
		act(() => {
			composer?.blur();
			footer?.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
			);
		});
		expect(document.activeElement).toBe(composer);
		expect(composer?.selectionStart).toBe(composer?.value.length);
	});

	it("renders a compact icon-only submit with an accessible name", () => {
		renderWorkspace();

		const surface = container.querySelector("[data-testid='prompt-bar']");
		expect(surface?.getAttribute("data-submit-appearance")).toBe("icon");

		const submit = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
		);
		expect(submit?.getAttribute("aria-label")).toBe("Kirim pesan");
		expect(submit?.getAttribute("title")).toBe("Kirim pesan");
		expect(submit?.textContent).toBe("");
		expect(submit?.querySelector("svg")).not.toBeNull();
		// Touch target stays comfortable on mobile viewports.
		expect(submit?.className).toContain("h-10");
		expect(submit?.className).toContain("w-10");
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

		const firstOption = card?.querySelector<HTMLInputElement>(
			"input[type='radio'][value='q1-opt1']",
		);
		act(() => {
			firstOption?.click();
		});
		expect(submit?.disabled).toBe(false);

		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSubmitAnswer).toHaveBeenCalledWith("q1", "Database relasional");
	});

	it("renders every option — including Lainnya — inside one radio group", () => {
		renderWorkspace({ questions: sampleQuestions, answers: {} });
		const card = container.querySelector(
			"[data-testid='adaptive-question-q1']",
		);
		const group = card?.querySelector("[role='radiogroup']");
		expect(group).not.toBeNull();
		const radios = group?.querySelectorAll("input[type='radio']") ?? [];
		// Both real options plus the free-text choice live in the same group.
		expect(radios.length).toBe(sampleQuestions[0].options.length + 1);
		const labels = [...(group?.querySelectorAll("label") ?? [])].map(
			(label) => label.textContent ?? "",
		);
		expect(labels.some((text) => text.includes("Lainnya"))).toBe(true);
		expect(labels.some((text) => text.includes("Database relasional"))).toBe(
			true,
		);
	});

	it("reveals the custom input inside the question when Lainnya is chosen", () => {
		renderWorkspace({ questions: sampleQuestions, answers: {} });
		const card = container.querySelector(
			"[data-testid='adaptive-question-q1']",
		);
		expect(card?.querySelector("input#custom-q1")).toBeNull();

		const customRadio = card?.querySelector<HTMLInputElement>(
			"input[type='radio'][value$='-custom']",
		);
		act(() => {
			customRadio?.click();
		});
		const input = card?.querySelector<HTMLInputElement>("input#custom-q1");
		expect(input).not.toBeNull();
		// The field stays inside the same question card: no extra card appears.
		expect(
			input?.closest("[data-testid='adaptive-question-q1']"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-testid='adaptive-question-q1']"),
		).toHaveLength(1);
	});

	it("treats a custom answer as exclusive for a single-select question", () => {
		const onSubmitAnswer = vi.fn();
		renderWorkspace({
			questions: sampleQuestions,
			answers: {},
			onSubmitAnswer,
		});
		const card = container.querySelector(
			"[data-testid='adaptive-question-q1']",
		);
		const firstOption = card?.querySelector<HTMLInputElement>(
			"input[type='radio'][value='q1-opt1']",
		);
		act(() => {
			firstOption?.click();
		});
		const customRadio = card?.querySelector<HTMLInputElement>(
			"input[type='radio'][value$='-custom']",
		);
		act(() => {
			customRadio?.click();
		});
		// Choosing Lainnya clears the previous single-select choice.
		expect(firstOption?.checked).toBe(false);
		expect(customRadio?.checked).toBe(true);

		const input = card?.querySelector<HTMLInputElement>("input#custom-q1");
		act(() => {
			if (input) {
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(input, "Penyimpanan terenkripsi");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		const submit = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
			/Kirim Jawaban/.test(b.textContent ?? ""),
		);
		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		// The custom text alone is the answer — never combined with the cleared
		// option label.
		expect(onSubmitAnswer).toHaveBeenCalledWith(
			"q1",
			"Penyimpanan terenkripsi",
		);
	});

	it("keeps an empty custom answer unsendable until it has content", () => {
		renderWorkspace({ questions: sampleQuestions, answers: {} });
		const card = container.querySelector(
			"[data-testid='adaptive-question-q1']",
		);
		const customRadio = card?.querySelector<HTMLInputElement>(
			"input[type='radio'][value$='-custom']",
		);
		act(() => {
			customRadio?.click();
		});
		const submit = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
			/Kirim Jawaban/.test(b.textContent ?? ""),
		);
		expect(submit?.disabled).toBe(true);
		expect(card?.textContent).toContain(
			"Isi jawaban sendiri agar bisa dikirim.",
		);
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
		const customRadio = q2?.querySelector<HTMLInputElement>(
			"input[type='radio'][value$='-custom']",
		);
		act(() => {
			customRadio?.click();
		});

		const customInput = q2?.querySelector<HTMLInputElement>("input#custom-q2");
		expect(customInput).not.toBeNull();
		act(() => {
			if (customInput) {
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(customInput, "Banner kilat");
				customInput.dispatchEvent(new Event("input", { bubbles: true }));
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

	it("shows the recommendation reason tied to a select option", () => {
		renderWorkspace({ questions: sampleQuestions, answers: {} });
		const reason = container.querySelector(
			"[data-testid='adaptive-question-reason-q1']",
		);
		expect(reason?.textContent).toContain(
			"Repo memakai penyimpanan lokal untuk preferensi.",
		);
	});

	it("lets a multiselect question select more than one option", () => {
		const onSubmitAnswer = vi.fn();
		renderWorkspace({
			questions: typedQuestions,
			answers: {},
			onSubmitAnswer,
		});

		const card = container.querySelector(
			"[data-testid='adaptive-question-t1']",
		);
		const options = [
			...(card?.querySelectorAll<HTMLInputElement>("input[type='checkbox']") ??
				[]),
		].filter((input) => !input.value.endsWith("-custom"));
		act(() => {
			options[0]?.click();
		});
		act(() => {
			options[1]?.click();
		});
		expect(options[0]?.checked).toBe(true);
		expect(options[1]?.checked).toBe(true);

		const submit = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
			/Kirim Jawaban/.test(b.textContent ?? ""),
		);
		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSubmitAnswer).toHaveBeenCalledWith(
			"t1",
			"Kartu film, Halaman detail",
		);
	});

	it("lets a multiselect answer add custom text on top of the chosen options", () => {
		const onSubmitAnswer = vi.fn();
		renderWorkspace({
			questions: typedQuestions,
			answers: {},
			onSubmitAnswer,
		});
		const card = container.querySelector(
			"[data-testid='adaptive-question-t1']",
		);
		const firstOption = card?.querySelector<HTMLInputElement>(
			"input[type='checkbox'][value='t1-opt1']",
		);
		act(() => {
			firstOption?.click();
		});
		const customBox = card?.querySelector<HTMLInputElement>(
			"input[type='checkbox'][value$='-custom']",
		);
		act(() => {
			customBox?.click();
		});
		// Multi-select keeps both: the custom choice is additive, not exclusive.
		expect(firstOption?.checked).toBe(true);
		expect(customBox?.checked).toBe(true);

		const input = card?.querySelector<HTMLInputElement>("input#custom-t1");
		act(() => {
			if (input) {
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(input, "Panel rekomendasi");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		const submit = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
			/Kirim Jawaban/.test(b.textContent ?? ""),
		);
		act(() => {
			submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSubmitAnswer).toHaveBeenCalledWith(
			"t1",
			"Kartu film, Panel rekomendasi",
		);
	});

	it("renders a text question as a free-text input without options", () => {
		renderWorkspace({
			questions: [typedQuestions[1]],
			answers: {},
		});
		const card = container.querySelector(
			"[data-testid='adaptive-question-t2']",
		);
		expect(card?.querySelector("input#custom-t2")).not.toBeNull();
		expect(card?.querySelector("input[type='radio']")).toBeNull();
		expect(card?.querySelector("input[type='checkbox']")).toBeNull();
		expect(card?.textContent).not.toContain("Lainnya");
	});

	it("locks earlier questions so a submitted answer cannot be changed", () => {
		renderWorkspace({
			questions: sampleQuestions,
			answers: { q1: "Database relasional" },
		});
		const q1 = container.querySelector("[data-testid='adaptive-question-q1']");
		const q2 = container.querySelector("[data-testid='adaptive-question-q2']");
		expect(q1?.querySelector("input[type='radio']")).toBeNull();
		const q2Radios = q2?.querySelectorAll<HTMLInputElement>(
			"input[type='radio']",
		);
		expect(q2Radios?.length).toBeGreaterThan(0);
		expect([...(q2Radios ?? [])].every((input) => !input.disabled)).toBe(true);
	});
});

describe("CodebaseChatWorkspace confirmation and spec errors", () => {
	const completeAnswers = { q1: "Database relasional", q2: "Toast notifikasi" };

	it("offers the feature specification step when all questions are answered", () => {
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
		expect(complete?.textContent).toContain("Berikutnya: Spesifikasi fitur");
		expect(complete?.textContent).toContain(
			"Spesifikasi fitur disusun dari jawaban tersebut dan konteks repository.",
		);

		const cta = [...(complete?.querySelectorAll("button") ?? [])].find((b) =>
			/Buat Spesifikasi Fitur/.test(b.textContent ?? ""),
		);
		act(() => {
			cta?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onConfirmGenerate).toHaveBeenCalledTimes(1);
	});

	it("hides the feature specification step once the pipeline advances past questions", () => {
		renderWorkspace({
			questions: sampleQuestions,
			answers: completeAnswers,
			stage: "feature",
			onGeneratePrd: vi.fn(),
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
			/Menyusun spesifikasi/.test(b.textContent ?? ""),
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

describe("CodebaseChatWorkspace composer without intent choice", () => {
	const planArtifact = {
		id: "tasks-abc",
		fileName: "tasks-demo.json",
		fileSizeBytes: null,
		badge: "KANBAN LIVE",
		description: "Task tree dan papan Kanban live",
	};

	it("never shows the persistent intent card", () => {
		renderWorkspace({ artifacts: [planArtifact] });
		expect(
			container.querySelector("[data-testid='codebase-intent-choice']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-intent-revise_current']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-intent-new_feature']"),
		).toBeNull();
	});

	it("sends a message in an existing plan without asking first", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({
			artifacts: [planArtifact],
			composerMode: "revise",
			composerTargetName: "Filter Artikel",
			onSendMessage,
		});
		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		act(() => {
			if (composer) setTextareaValue(composer, "Tambah opsi ekspor Markdown");
		});
		const sendButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
		);
		expect(sendButton?.disabled).toBe(false);
		expect(composer?.placeholder).not.toContain("Pilih dulu");
		act(() => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSendMessage).toHaveBeenCalledWith("Tambah opsi ekspor Markdown");
	});

	it("keeps the composer usable before anything exists", () => {
		const onSendMessage = vi.fn();
		renderWorkspace({ artifacts: [], onSendMessage });
		expect(
			container.querySelector("[data-testid='codebase-intent-choice']"),
		).toBeNull();
		const composer = container.querySelector<HTMLTextAreaElement>(
			"#codebase-chat-composer",
		);
		act(() => {
			if (composer) setTextareaValue(composer, "Tambah mode gelap");
		});
		const sendButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='prompt-bar-submit']",
		);
		expect(sendButton?.disabled).toBe(false);
		act(() => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSendMessage).toHaveBeenCalledWith("Tambah mode gelap");
	});

	it("names the active feature above the composer", () => {
		renderWorkspace({
			artifacts: [planArtifact],
			composerMode: "revise",
			composerTargetName: "Filter Artikel",
		});
		const target = container.querySelector(
			"[data-testid='codebase-composer-target']",
		);
		expect(target?.textContent).toContain("Filter Artikel");
	});

	it("labels a new-feature composer instead of borrowing a plan name", () => {
		renderWorkspace({ artifacts: [], composerMode: "create" });
		const target = container.querySelector(
			"[data-testid='codebase-composer-target']",
		);
		expect(target?.textContent).toContain("Fitur baru");
	});

	it("shows the task impact inline while revising", () => {
		renderWorkspace({
			artifacts: [planArtifact],
			composerMode: "revise",
			composerTargetName: "Filter Artikel",
			revisionImpactNotice:
				"Revisi ini berdampak pada 2 task selesai. Menyusun ulang task akan mereset progres tersebut.",
		});
		const notice = container.querySelector(
			"[data-testid='codebase-revision-impact']",
		);
		expect(notice?.textContent).toContain("2 task selesai");
	});

	it("hides the task impact while creating a new feature", () => {
		renderWorkspace({
			artifacts: [],
			composerMode: "create",
			revisionImpactNotice: "Revisi ini berdampak pada 1 task selesai.",
		});
		expect(
			container.querySelector("[data-testid='codebase-revision-impact']"),
		).toBeNull();
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
			"npx vibeeverything export plan proj-123 --root .",
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
	const featureArtifact = {
		id: "feature-abc",
		fileName: "feature-demo.json",
		fileSizeBytes: null,
		badge: "FITUR",
		description: "Spesifikasi fitur demo",
	};

	it("offers the next stage only at the feature stage, with the artifact beside it", () => {
		const onGeneratePrd = vi.fn();
		renderWorkspace({
			stage: "feature",
			artifacts: [featureArtifact],
			onGeneratePrd,
		});

		const cta = container.querySelector("[data-testid='codebase-stage-prd']");
		expect(cta).not.toBeNull();
		// Settled outcome plus the next request, in one conversational block.
		expect(cta?.textContent).toContain("Spesifikasi fitur siap");
		expect(cta?.textContent).toContain("Berikutnya: PRD");
		expect(cta?.textContent).toContain(
			"Menyusun PRD 8 seksi dari spesifikasi fitur dan konteks repository.",
		);
		// The finished artifact is the same FileCard used in the chat stream.
		expect(
			cta?.querySelector("[data-testid='codebase-file-card']"),
		).not.toBeNull();

		const button = [...(cta?.querySelectorAll("button") ?? [])].find((b) =>
			/Buat PRD/.test(b.textContent ?? ""),
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

	it("offers the AC step at the prd stage with busy state", () => {
		renderWorkspace({
			stage: "prd",
			stageBusy: "ac",
			onGenerateAc: vi.fn(),
		});

		const cta = container.querySelector("[data-testid='codebase-stage-ac']");
		expect(cta).not.toBeNull();
		expect(cta?.textContent).toContain("PRD selesai");
		expect(cta?.textContent).toContain("Berikutnya: Acceptance Criteria");
		const button = [...(cta?.querySelectorAll("button") ?? [])].find((b) =>
			/Menyusun AC/.test(b.textContent ?? ""),
		);
		expect(button?.disabled).toBe(true);
	});

	it("offers the Task step at the ac stage", () => {
		const onGenerateTask = vi.fn();
		renderWorkspace({ stage: "ac", onGenerateTask });

		const cta = container.querySelector("[data-testid='codebase-stage-task']");
		expect(cta).not.toBeNull();
		expect(cta?.textContent).toContain("Acceptance Criteria selesai");
		expect(cta?.textContent).toContain("Berikutnya: Task dan Kanban");

		const button = [...(cta?.querySelectorAll("button") ?? [])].find((b) =>
			/Buat Task/.test(b.textContent ?? ""),
		);
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onGenerateTask).toHaveBeenCalledTimes(1);
	});

	it("never offers the Task step while tasks are unresolved", () => {
		// The task read has not settled, so the workspace cannot prove tasks are
		// absent. Offering "Buat Task" here would invite regenerating tasks that
		// may already be in the database.
		const onGenerateTask = vi.fn();
		renderWorkspace({ stage: "ac", onGenerateTask, tasksUnresolved: true });

		expect(
			container.querySelector("[data-testid='codebase-stage-task']"),
		).toBeNull();
		expect(onGenerateTask).not.toHaveBeenCalled();
	});

	it("shows no stage CTA at the terminal handoff stage", () => {
		// With 30 tasks persisted, the stage is handoff and no regeneration
		// button may appear at all.
		renderWorkspace({
			stage: "handoff",
			projectIdForHandoff: "project-1",
			onGenerateTask: vi.fn(),
			onGenerateAc: vi.fn(),
			onGeneratePrd: vi.fn(),
		});

		expect(
			container.querySelector("[data-testid='codebase-stage-task']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-stage-ac']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-stage-prd']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-handoff-card']"),
		).not.toBeNull();
	});

	it("shows no artifact card before the artifact is confirmed persisted", () => {
		renderWorkspace({
			stage: "feature",
			artifacts: [],
			onGeneratePrd: vi.fn(),
		});
		const cta = container.querySelector("[data-testid='codebase-stage-prd']");
		expect(cta).not.toBeNull();
		expect(cta?.querySelector("[data-testid='codebase-file-card']")).toBeNull();
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

	it("never renders two error rows for one failed stage", () => {
		renderWorkspace({
			stage: "prd",
			run: settleRun(
				startRun("ac", Date.now() - 1000),
				"failed",
				Date.now(),
				"Kredit habis.",
			),
			stageError: "Kredit habis.",
		});
		expect(
			container.querySelectorAll("[data-testid='codebase-stage-error']"),
		).toHaveLength(0);
		expect(
			container.querySelectorAll("[data-testid='codebase-questions-error']"),
		).toHaveLength(1);
	});

	it("renders the handoff prompt with the CLI plan export for this project", () => {
		renderWorkspace({
			projectIdForHandoff: "proj-123",
			codebaseName: "react-movie-app",
		});

		const card = container.querySelector(
			"[data-testid='codebase-handoff-card']",
		);
		expect(card).not.toBeNull();
		// The handoff uses the real project id with the CLI plan export, not the
		// old rules export and not a placeholder.
		expect(card?.textContent).toContain(
			"npx vibeeverything export plan proj-123 --root .",
		);
		expect(card?.textContent).not.toContain("export rules");
		expect(card?.textContent).toContain("docs/vibeplan/");
		expect(card?.textContent).toContain("Project ID: proj-123");
		expect(card?.textContent).toContain("polling");
	});

	it("offers no handoff before tasks exist", () => {
		renderWorkspace({ projectIdForHandoff: null });
		expect(
			container.querySelector("[data-testid='codebase-handoff-card']"),
		).toBeNull();
	});
});
