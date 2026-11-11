// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkspace } from "../components/workspace/studio-workspace";
import type { StudioDetailLoaderData } from "../types/studio";
import { studioStatusSchema } from "../types/studio-status";

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock("../components/canvas/studio-canvas", () => ({
	StudioCanvas: ({
		frames,
		onSelectFrame,
	}: {
		frames: { id: string; name: string }[];
		onSelectFrame: (id: string) => void;
	}) => (
		<section aria-label="Canvas">
			{frames.map((frame) => (
				<button
					key={frame.id}
					type="button"
					onClick={() => onSelectFrame(frame.id)}
				>
					{frame.name}
				</button>
			))}
		</section>
	),
}));
function fixture(): StudioDetailLoaderData {
	const date = new Date("2026-01-01");
	const data = studioStatusSchema.parse({
		project: {
			id: "chat-p",
			userId: "chat-u",
			title: "Travel",
			titleSource: "user",
			designMode: "web",
			designMd: null,
			designSkillId: "none",
			initialPageCount: 1,
			designReference: null,
			designBlueprint: null,
			designBlueprintVersion: 1,
			designSkillVersion: null,
			logoAssetId: null,
			prdContent: null,
			prdFilename: null,
			prdContentHash: null,
			createdAt: date,
			updatedAt: date,
		},
		frames: [
			{
				id: "chat-f",
				projectId: "chat-p",
				name: "Eksplorasi",
				description: null,
				viewport: "web",
				htmlCode: null,
				status: "queued",
				order: 0,
				error: null,
				attempts: 0,
				visualHash: null,
				promptHash: null,
				createdAt: date,
				updatedAt: date,
			},
		],
		activeJob: null,
		messages: [
			{
				id: "message-a",
				projectId: "chat-p",
				userId: "chat-u",
				operationId: "op",
				jobIds: ["job"],
				role: "assistant",
				content: "Menunggu giliran",
				order: 1,
				status: "queued",
				attachments: [],
				progress: null,
				createdAt: date,
				updatedAt: date,
			},
		],
	});
	return { ...data, logoUrl: null, revisions: [], latest: null };
}
let width = 1280;
let mediaListeners: (() => void)[] = [];
beforeEach(() => {
	sessionStorage.clear();
	width = 1280;
	mediaListeners = [];
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			get matches() {
				return width >= 1024;
			},
			addEventListener: (_: string, fn: () => void) => mediaListeners.push(fn),
			removeEventListener: () => {},
		})),
	);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
			unobserve() {}
		},
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify(fixture()))),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("keeps draft and selected frame across collapse, progress update and reload", async () => {
	const initial = fixture();
	const { rerender, unmount } = render(
		<StudioWorkspace initialData={initial} />,
	);
	fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Ubah tata letak kartu" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Tutup panel chat" }));
	const next = fixture();
	next.messages = next.messages?.map((m) => ({
		...m,
		status: "completed",
		content: "Satu halaman tersedia",
		updatedAt: new Date("2026-01-02"),
	}));
	rerender(<StudioWorkspace initialData={next} />);
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Ubah tata letak kartu",
	);
	expect(
		screen.getByRole("button", { name: "Lepas Eksplorasi" }),
	).toBeDefined();
	expect(screen.getByRole("log").textContent).toContain(
		"Satu halaman tersedia",
	);
	unmount();
	render(<StudioWorkspace initialData={next} />);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Ubah tata letak kartu",
	);
});
it("preserves failed drafts and reuses a request ID after remount without clearing newer typing", async () => {
	const bodies: { requestId: string }[] = [];
	let accepted = false;
	let finish: (() => void) | undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init?.body) return new Response(JSON.stringify(fixture()));
			bodies.push(JSON.parse(String(init.body)));
			if (!accepted) throw new TypeError("offline");
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
			return new Response(JSON.stringify({ intent: "add_screen", jobs: [] }), {
				status: 202,
			});
		}),
	);
	const initial = fixture();
	const { unmount } = render(<StudioWorkspace initialData={initial} />);
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Tambah halaman Profil" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Kirim prompt" }));
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Kirim prompt" })).toHaveProperty(
			"disabled",
			false,
		),
	);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Tambah halaman Profil",
	);
	unmount();
	accepted = true;
	render(<StudioWorkspace initialData={initial} />);
	fireEvent.click(screen.getByRole("button", { name: "Kirim prompt" }));
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Tambah halaman Riwayat" },
	});
	await act(async () => finish?.());
	expect(bodies[1].requestId).toBe(bodies[0].requestId);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Tambah halaman Riwayat",
	);
});
it.each([
	360, 768,
])("controls the mobile drawer at %i px and keeps draft after Escape", async (viewport) => {
	width = viewport;
	render(<StudioWorkspace initialData={fixture()} />);
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	expect(screen.getByRole("dialog")).toBeDefined();
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Tambah halaman Profil" },
	});
	fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(document.activeElement).toBe(
		screen.getByRole("button", { name: "Buka panel chat" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Tambah halaman Profil",
	);
});

it("keeps drafts isolated by project and account", () => {
	const initial = fixture();
	const { rerender } = render(<StudioWorkspace initialData={initial} />);
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Draft project pertama" },
	});
	const second = fixture();
	second.project = { ...second.project, id: "other-project" };
	second.frames = second.frames.map((frame) => ({
		...frame,
		projectId: second.project.id,
	}));
	second.messages = [];
	rerender(<StudioWorkspace initialData={second} />);
	expect(screen.getByRole("textbox")).toHaveProperty("value", "");
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Draft project kedua" },
	});
	rerender(<StudioWorkspace initialData={initial} />);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Draft project pertama",
	);
	const otherUser = fixture();
	otherUser.project = { ...otherUser.project, userId: "other-user" };
	otherUser.messages = [];
	rerender(<StudioWorkspace initialData={otherUser} />);
	expect(screen.getByRole("textbox")).toHaveProperty("value", "");
});

it("restores newer progress on reconnect without interrupting the draft", async () => {
	const initial = fixture();
	const next = fixture();
	next.messages = next.messages?.map((message) => ({
		...message,
		content: "Persisted partial result",
		status: "partial",
		updatedAt: new Date("2026-01-02"),
	}));
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json(next)),
	);
	render(<StudioWorkspace initialData={initial} />);
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Draft selama reconnect" },
	});
	await act(async () => {
		window.dispatchEvent(new Event("online"));
	});
	expect(screen.getByRole("log").textContent).toContain(
		"Persisted partial result",
	);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Draft selama reconnect",
	);
});

it("closes the mobile modal when crossing the desktop breakpoint without losing its draft", async () => {
	width = 768;
	render(<StudioWorkspace initialData={fixture()} />);
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Draft lintas breakpoint" },
	});
	width = 1280;
	await act(async () => {
		for (const update of mediaListeners) update();
	});
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Draft lintas breakpoint",
	);
	width = 360;
	await act(async () => {
		for (const update of mediaListeners) update();
	});
	expect(screen.queryByRole("textbox")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Draft lintas breakpoint",
	);
});

it("retains the selected target and operation identity when a failed request is retried after reload", async () => {
	const bodies: { requestId: string; frameIds: string[] }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init?.body) return Response.json(fixture());
			bodies.push(JSON.parse(String(init.body)));
			throw new TypeError("offline");
		}),
	);
	const { unmount } = render(<StudioWorkspace initialData={fixture()} />);
	fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Ubah ukuran tombol pada layar ini" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Kirim prompt" }));
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Kirim prompt" })).toHaveProperty(
			"disabled",
			false,
		),
	);
	unmount();
	render(<StudioWorkspace initialData={fixture()} />);
	fireEvent.click(screen.getByRole("button", { name: "Kirim prompt" }));
	await waitFor(() => expect(bodies).toHaveLength(2));
	expect(bodies[1].requestId).toBe(bodies[0].requestId);
	expect(bodies[1].frameIds).toEqual(["chat-f"]);
});

it("detaching a target keeps its frame on the canvas", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));

	fireEvent.click(screen.getByRole("button", { name: "Lepas Eksplorasi" }));

	expect(screen.queryByRole("button", { name: "Lepas Eksplorasi" })).toBeNull();
	// Detaching is a composer-scope action: the artboard itself is untouched.
	expect(screen.getByRole("button", { name: "Eksplorasi" })).toBeDefined();
});

it("drops a target whose frame was replaced, so the next request sends no ghost id", async () => {
	const bodies: { frameIds: string[] }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init?.body) return Response.json(fixture());
			bodies.push(JSON.parse(String(init.body)));
			return Response.json({ intent: "revise_selected", jobs: [] });
		}),
	);
	const initial = fixture();
	const { rerender } = render(<StudioWorkspace initialData={initial} />);
	fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));
	expect(
		screen.getByRole("button", { name: "Lepas Eksplorasi" }),
	).toBeDefined();

	// Planning replaced the slot: the row with id "chat-f" is gone from the canvas.
	const replaced = fixture();
	replaced.frames = [];
	replaced.messages = [];
	rerender(<StudioWorkspace initialData={replaced} />);

	expect(screen.queryByRole("button", { name: "Lepas Eksplorasi" })).toBeNull();
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Ubah warna aksen tombol utama" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Kirim prompt" }));

	await waitFor(() => expect(bodies).toHaveLength(1));
	expect(bodies[0].frameIds).toEqual([]);
});

it("keeps the submitted target set when the selection changes mid-flight", async () => {
	const bodies: { frameIds: string[] }[] = [];
	let release: (() => void) | undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init?.body) return Response.json(fixture());
			bodies.push(JSON.parse(String(init.body)));
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return Response.json({ intent: "revise_selected", jobs: [] });
		}),
	);
	render(<StudioWorkspace initialData={fixture()} />);
	fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Ubah ukuran tombol pada layar ini" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Kirim prompt" }));
	await waitFor(() => expect(bodies).toHaveLength(1));

	// A detach while the request is in flight belongs to the next message.
	fireEvent.click(screen.getByRole("button", { name: "Lepas Eksplorasi" }));
	await act(async () => release?.());

	expect(bodies[0].frameIds).toEqual(["chat-f"]);
});

it("keeps composer targets inside their own project", () => {
	const initial = fixture();
	const { rerender } = render(<StudioWorkspace initialData={initial} />);
	fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));
	expect(
		screen.getByRole("button", { name: "Lepas Eksplorasi" }),
	).toBeDefined();

	const other = fixture();
	other.project = { ...other.project, id: "other-project" };
	other.frames = [
		...other.frames.map((frame) => ({
			...frame,
			id: "other-f",
			projectId: other.project.id,
			name: "Lain",
		})),
	];
	rerender(<StudioWorkspace initialData={other} />);

	// The previous project's frame id is not a target of this canvas.
	expect(screen.queryByRole("button", { name: "Lepas Eksplorasi" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Lepas Lain" })).toBeNull();
});

it("never sends a model request while the canvas selection moves", async () => {
	const bodies: unknown[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.body) bodies.push(init.body);
			return Response.json(fixture());
		}),
	);
	render(<StudioWorkspace initialData={fixture()} />);

	for (let index = 0; index < 3; index++) {
		fireEvent.click(screen.getByRole("button", { name: "Eksplorasi" }));
		fireEvent.click(screen.getByRole("button", { name: "Lepas Eksplorasi" }));
	}

	// Suggestions are derived, not requested: selecting or detaching a target
	// never posts an operation on its own.
	expect(bodies).toEqual([]);
});
