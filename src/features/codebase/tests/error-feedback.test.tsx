// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CodebaseChatWorkspaceSpecError,
	CodebaseChatWorkspaceStageError,
	resolveCodebaseErrorDetails,
} from "../components/chat/codebase-chat-workspace-error-rows";

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
		act(() => {
			root?.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

describe("Error Feedback: resolveCodebaseErrorDetails", () => {
	it("maps network and connectivity failures to Periksa status recovery", () => {
		const res = resolveCodebaseErrorDetails(
			"Jaringan terputus. Jawaban tetap tersimpan di layar, coba lagi.",
			"Generasi gagal",
		);
		expect(res.title).toBe("Koneksi ke server terputus");
		expect(res.description).toContain("Jawaban tetap tersimpan di layar");
		expect(res.actionLabel).toBe("Periksa status");
	});

	it("maps persistence failure and communicates that user inputs are preserved", () => {
		const res = resolveCodebaseErrorDetails(
			"Jawaban gagal disimpan ke server. Jawaban tetap aman di layar, coba lagi.",
			"Gagal menyimpan",
		);
		expect(res.title).toBe("Hasil belum berhasil disimpan");
		expect(res.description).toContain("tetap aman di layar");
		expect(res.actionLabel).toBe("Coba lagi");
	});

	it("maps session expiration to login recovery action", () => {
		const res = resolveCodebaseErrorDetails(
			"Sesi Anda telah berakhir. Silakan login kembali.",
			"Akses ditolak",
		);
		expect(res.title).toBe("Sesi Anda telah berakhir");
		expect(res.actionLabel).toBe("Login kembali");
	});

	it("maps context readiness requirement to clear explanation", () => {
		const res = resolveCodebaseErrorDetails(
			"Konteks repositori belum siap. Selesaikan analisis codebase lalu coba lagi.",
			"Analisis diperlukan",
		);
		expect(res.title).toBe("Konteks repositori belum siap");
		expect(res.description).toContain("Selesaikan analisis codebase");
		expect(res.actionLabel).toBe("Coba lagi");
	});
});

describe("Error Feedback: CodebaseChatWorkspaceSpecError component", () => {
	it("renders neutral professional surface instead of full-red background and border", () => {
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceSpecError
					message="Spesifikasi fitur gagal dibuat. Coba lagi."
					onRetry={vi.fn()}
				/>,
			);
		});

		const alertEl = container.querySelector(
			"[data-testid='codebase-spec-error']",
		);
		expect(alertEl).not.toBeNull();
		expect(alertEl?.getAttribute("role")).toBe("alert");

		const classList = alertEl?.className ?? "";
		// Neutral surface
		expect(classList).toContain("bg-charcoal");
		expect(classList).toContain("border-graphite");
		// No full red container
		expect(classList).not.toContain("bg-crimson/10");
		expect(classList).not.toContain("border-crimson/30");
	});

	it("displays clear heading, secondary explanation, and retry action", () => {
		const onRetry = vi.fn();
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceSpecError
					message="Spesifikasi fitur gagal dibuat. Coba lagi."
					onRetry={onRetry}
				/>,
			);
		});

		const alertEl = container.querySelector(
			"[data-testid='codebase-spec-error']",
		);
		expect(alertEl?.textContent).toContain(
			"Spesifikasi fitur belum berhasil dibuat",
		);
		expect(alertEl?.textContent).toContain(
			"Spesifikasi fitur gagal dibuat. Coba lagi.",
		);

		const retryBtn = alertEl?.querySelector("button");
		expect(retryBtn).not.toBeNull();
		expect(retryBtn?.textContent).toContain("Coba lagi");

		act(() => {
			retryBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("disables retry button while operation is in flight", () => {
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceSpecError
					message="Spesifikasi fitur gagal dibuat."
					isRetrying={true}
					onRetry={vi.fn()}
				/>,
			);
		});

		const retryBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-spec-error'] button",
		);
		expect(retryBtn?.disabled).toBe(true);
	});
});

describe("Error Feedback: CodebaseChatWorkspaceStageError component", () => {
	it("renders neutral surface with stage error description and recovery action", () => {
		const onRetry = vi.fn();
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceStageError
					message="Generate AC hanya tersedia di paket Pro dan Hengker."
					onRetry={onRetry}
				/>,
			);
		});

		const alertEl = container.querySelector(
			"[data-testid='codebase-stage-error']",
		);
		expect(alertEl).not.toBeNull();
		expect(alertEl?.getAttribute("role")).toBe("alert");
		expect(alertEl?.className).toContain("bg-charcoal");
		expect(alertEl?.className).not.toContain("bg-crimson/10");

		expect(alertEl?.textContent).toContain(
			"Generate AC hanya tersedia di paket Pro dan Hengker.",
		);

		const retryBtn = alertEl?.querySelector("button");
		expect(retryBtn).not.toBeNull();
		act(() => {
			retryBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
