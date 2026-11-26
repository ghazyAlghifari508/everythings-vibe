// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StudioFrameRow, StudioMessageRow } from "@/db/schema";
import { StudioChatResult } from "../components/workspace/studio-chat-result";
import { resetStudioThumbnailCache } from "../hooks/use-studio-thumbnail";
import type {
	StudioMessageFrame,
	StudioMessageProgress,
} from "../types/studio-conversation";

const date = new Date("2026-01-01");
const LONG =
	"Kelola Pencairan Dana Publisher dan Verifikasi Bukti Transfer Bank Mingguan";

function frame(id: string, over: Partial<StudioFrameRow> = {}): StudioFrameRow {
	return {
		id,
		projectId: "p1",
		name: id,
		description: null,
		viewport: "web",
		htmlCode: "<body><h1>Nyata</h1></body>",
		status: "ready",
		order: 0,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		originJobId: null,
		initialSlot: null,
		revision: 1,
		lastJobId: null,
		createdAt: date,
		updatedAt: date,
		...over,
	};
}

function shown(
	id: string,
	over: Partial<StudioMessageFrame> = {},
): StudioMessageFrame {
	return {
		frameId: id,
		name: id,
		viewport: "web",
		status: "ready",
		revision: 1,
		...over,
	};
}

function message(
	frames: StudioMessageFrame[],
	over: Partial<StudioMessageProgress> = {},
	status: StudioMessageRow["status"] = "completed",
): StudioMessageRow {
	return {
		id: "m",
		projectId: "p1",
		userId: "u",
		operationId: "op",
		jobIds: ["j"],
		role: "assistant",
		content: "",
		order: 1,
		status,
		attachments: [],
		progress: {
			phase: "completed",
			ready: frames.length,
			total: frames.length,
			failed: 0,
			kind: "initial",
			screenNames: frames.map((entry) => entry.name),
			recovery: null,
			frames,
			...over,
		},
		createdAt: date,
		updatedAt: date,
	};
}

let thumbnails: ReturnType<typeof vi.fn>;
beforeEach(() => {
	resetStudioThumbnailCache();
	thumbnails = vi.fn(async (input: string) => {
		const params = new URL(input, "http://x").searchParams;
		return new Response(
			JSON.stringify({
				html: `<!doctype html><body><h1>${params.get("frameId")}</h1></body>`,
				projectId: params.get("projectId"),
				frameId: params.get("frameId"),
				revision: 1,
			}),
		);
	});
	vi.stubGlobal("fetch", thumbnails);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("shows the real count, each frame's name and platform, and a thumbnail built from committed HTML", async () => {
	render(
		<StudioChatResult
			message={message([
				shown("a", { name: "Kelola Pencairan" }),
				shown("b", { name: "Kelola Pencairan", viewport: "mobile" }),
			])}
			frames={[
				frame("a", { name: "Kelola Pencairan" }),
				frame("b", { name: "Kelola Pencairan", viewport: "mobile" }),
			]}
			onOpenFrame={() => {}}
		/>,
	);
	const card = screen.getByRole("region", { name: "Hasil desain" });
	expect(within(card).getByRole("heading").textContent).toBe("2 layar dibuat");
	expect(card.textContent).toContain("Web UI");
	expect(card.textContent).toContain("Mobile UI");
	await waitFor(() => expect(card.querySelectorAll("iframe")).toHaveLength(2));
	for (const iframe of card.querySelectorAll("iframe")) {
		// A thumbnail is a picture: no script, no same-origin, no interaction.
		expect(iframe.getAttribute("sandbox")).toBe("");
		expect(iframe.tabIndex).toBe(-1);
	}
	// Each row fetched its own frame from the committed-HTML endpoint, once.
	const urls = thumbnails.mock.calls.map(([input]) => String(input));
	expect(urls).toHaveLength(2);
	for (const url of urls) {
		expect(url).toContain("thumbnail=1");
		expect(url).toContain("projectId=p1");
	}
});

it("shows honest metadata, never a drawn image, when the preview cannot load", async () => {
	thumbnails.mockImplementation(
		async () => new Response("{}", { status: 500 }),
	);
	render(
		<StudioChatResult
			message={message([shown("a", { name: "Profil" })])}
			frames={[frame("a", { name: "Profil" })]}
			onOpenFrame={() => {}}
		/>,
	);
	const thumb = await screen.findByTestId("studio-result-thumbnail");
	await waitFor(() =>
		expect(thumb.getAttribute("data-state")).toBe("unavailable"),
	);
	expect(thumb.querySelector("iframe, img, svg")).toBeNull();
	expect(screen.getByRole("button", { name: /Profil, Web UI/ })).toBeDefined();
});

it("rejects a thumbnail document that belongs to another project or frame", async () => {
	thumbnails.mockImplementation(
		async () =>
			new Response(
				JSON.stringify({
					html: "<body>milik orang lain</body>",
					projectId: "other",
					frameId: "a",
					revision: 1,
				}),
			),
	);
	render(
		<StudioChatResult
			message={message([shown("a")])}
			frames={[frame("a")]}
			onOpenFrame={() => {}}
		/>,
	);
	const thumb = await screen.findByTestId("studio-result-thumbnail");
	await waitFor(() =>
		expect(thumb.getAttribute("data-state")).toBe("unavailable"),
	);
	expect(document.body.innerHTML).not.toContain("milik orang lain");
});

it("requests no preview for a pending or failed frame and labels it honestly", () => {
	render(
		<StudioChatResult
			message={message(
				[shown("a", { status: "pending" }), shown("b", { status: "failed" })],
				{ phase: "generating", ready: 0, total: 2 },
				"generating",
			)}
			frames={[
				frame("a", { htmlCode: null, status: "generating", revision: 0 }),
				frame("b", { htmlCode: null, status: "failed", revision: 0 }),
			]}
			onOpenFrame={() => {}}
		/>,
	);
	expect(thumbnails).not.toHaveBeenCalled();
	const card = screen.getByRole("region", { name: "Hasil desain" });
	expect(card.textContent).toContain("Sedang dibuat");
	expect(card.textContent).toContain("Belum berhasil");
	expect(screen.getByRole("status").textContent).toContain(
		"Membuat layar 0 dari 2",
	);
});

it("opens exactly the frame whose row was activated, by mouse and by keyboard", () => {
	const onOpenFrame = vi.fn();
	render(
		<StudioChatResult
			message={message([shown("a"), shown("b")])}
			frames={[frame("a"), frame("b")]}
			onOpenFrame={onOpenFrame}
		/>,
	);
	const rows = screen.getAllByRole("button", { name: /Buka di canvas/ });
	fireEvent.click(rows[1]);
	expect(onOpenFrame).toHaveBeenLastCalledWith("b");
	// Native buttons: Enter/Space activate through the same click handler.
	expect(rows.every((row) => row.tagName === "BUTTON")).toBe(true);
	expect(rows.every((row) => row.getAttribute("type") === "button")).toBe(true);
});

it("does not offer to open a frame that no longer exists in this project", () => {
	const onOpenFrame = vi.fn();
	render(
		<StudioChatResult
			message={message([shown("gone", { name: "Dihapus" })])}
			frames={[frame("other")]}
			onOpenFrame={onOpenFrame}
		/>,
	);
	expect(screen.queryByRole("button", { name: /Dihapus/ })).toBeNull();
	expect(
		screen.getByRole("img", { name: /Dihapus.*Tidak ada di canvas/ }),
	).toBeDefined();
	expect(onOpenFrame).not.toHaveBeenCalled();
});

it("collapses and expands the list with correct disclosure state", () => {
	render(
		<StudioChatResult
			message={message([shown("a", { name: "Profil" })])}
			frames={[frame("a", { name: "Profil" })]}
			onOpenFrame={() => {}}
		/>,
	);
	const toggle = screen.getByRole("button", { name: /1 layar dibuat/ });
	expect(toggle.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(toggle);
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	expect(
		document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.hidden,
	).toBe(true);
	fireEvent.click(toggle);
	expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

it("truncates a long title visually while keeping the full title accessible", () => {
	render(
		<StudioChatResult
			message={message([shown("a", { name: LONG })])}
			frames={[frame("a", { name: LONG })]}
			onOpenFrame={() => {}}
		/>,
	);
	const title = screen.getByTitle(LONG);
	expect(title.className).toContain("truncate");
	expect(title.textContent).toBe(LONG);
	expect(screen.getByRole("button", { name: new RegExp(LONG) })).toBeDefined();
});

it("keeps the job status line separate from the result and describes only the job", () => {
	render(
		<StudioChatResult
			message={message([shown("a")])}
			frames={[frame("a")]}
			onOpenFrame={() => {}}
		/>,
	);
	const card = screen.getByRole("region", { name: "Hasil desain" });
	const status = screen.getByRole("status");
	expect(card.contains(status)).toBe(false);
	expect(status.textContent).toBe("Selesai");
});

it("shows only a status line before any frame exists", () => {
	render(
		<StudioChatResult
			message={message(
				[],
				{ phase: "queued", total: 0, ready: 0, screenNames: [] },
				"queued",
			)}
			frames={[]}
			onOpenFrame={() => {}}
		/>,
	);
	expect(screen.queryByRole("region", { name: "Hasil desain" })).toBeNull();
	expect(screen.getByRole("status").textContent).toBe("Menunggu giliran");
});

it("marks a revision result that was edited again since, without rewriting the report", () => {
	render(
		<StudioChatResult
			message={message([shown("a", { revision: 2 })], { kind: "revise" })}
			frames={[frame("a", { revision: 5 })]}
			onOpenFrame={() => {}}
		/>,
	);
	expect(screen.getByRole("heading").textContent).toBe("1 layar diperbarui");
	expect(
		screen.getByRole("button", { name: /Sudah diubah lagi/ }),
	).toBeDefined();
});
