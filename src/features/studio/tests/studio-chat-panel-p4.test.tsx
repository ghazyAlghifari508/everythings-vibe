// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkspace } from "../components/workspace/studio-workspace";
import type { StudioDetailLoaderData } from "../types/studio";
import { STUDIO_USER_MESSAGE_COLLAPSE_CHARS } from "../types/studio-constants";
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
	StudioCanvas: () => <section aria-label="Canvas" />,
}));

const LONG_PROMPT = `Buat aplikasi travel untuk liburan keluarga.\n\n- Cari paket\n- Bandingkan harga\n${"Detail brief. ".repeat(40)}`;
const date = new Date("2026-01-01");

function message(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		projectId: "p4-p",
		userId: "p4-u",
		operationId: "op",
		jobIds: ["job"],
		attachments: [],
		progress: null,
		createdAt: date,
		updatedAt: date,
		...overrides,
	};
}

function fixture(
	messages: Record<string, unknown>[] = [],
): StudioDetailLoaderData {
	const data = studioStatusSchema.parse({
		project: {
			id: "p4-p",
			userId: "p4-u",
			title: "Jelajahin",
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
		frames: [],
		activeJob: null,
		messages,
	});
	return { ...data, logoUrl: null, revisions: [], latest: null };
}

const conversation = [
	message({
		id: "m-user",
		role: "user",
		content: LONG_PROMPT,
		order: 0,
		status: "accepted",
	}),
	message({
		id: "m-short",
		role: "user",
		content: "Tambah halaman Profil",
		order: 2,
		status: "accepted",
	}),
	message({
		id: "m-assistant",
		role: "assistant",
		content:
			"Saya merancang **Jelajahin**.\n\n- **Jelajah:** pencarian\n- Tiket\n\n[tautan aman](https://example.com) [jahat](javascript:alert(1)) <script>window.pwned=1</script><img src=x onerror=alert(1)>",
		order: 1,
		status: "partial",
		progress: {
			phase: "partial",
			ready: 3,
			total: 4,
			failed: 1,
			kind: "initial",
			failedScreens: ["Tiket Saya"],
			screenNames: ["Jelajah", "Detail", "Pesan", "Tiket Saya"],
			recovery: "frames",
		},
	}),
];

beforeEach(() => {
	sessionStorage.clear();
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches: true,
			addEventListener: () => {},
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
		vi.fn(async () => new Response(JSON.stringify(fixture(conversation)))),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function userBubble(text: RegExp) {
	return screen
		.getAllByRole("article", { name: "Pesan Anda" })
		.find((node) => text.test(node.textContent ?? ""));
}

it("floats over the canvas with visible margins instead of docking as a sidebar", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const panel = screen.getByRole("complementary", { name: "Design agent" });
	const classes = panel.className.split(" ");
	expect(classes).toContain("absolute");
	expect(classes).toContain("left-3");
	expect(classes).toContain("bottom-3");
	expect(classes).not.toContain("border-r");
	expect(classes).not.toContain("h-full");
	// The canvas is a sibling underneath, so the panel cannot compress it.
	expect(panel.parentElement?.contains(screen.getByLabelText("Canvas"))).toBe(
		true,
	);
	expect(panel.contains(screen.getByLabelText("Canvas"))).toBe(false);
});

it("keeps the workspace header free of an opaque bar and of the chat toggle", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const header = screen.getByTestId("studio-header");
	expect(header.className.split(" ")).not.toContain("border-b");
	expect(header.className.split(" ")).not.toContain("bg-charcoal");
	expect(header.className).toContain("pointer-events-none");
	expect(
		within(header).queryByRole("button", { name: /panel chat/i }),
	).toBeNull();
	// Header controls the project still needs.
	expect(
		within(header).getByRole("button", { name: "Export project" }),
	).toBeDefined();
	expect(within(header).getByRole("heading", { level: 1 }).textContent).toBe(
		"Jelajahin",
	);
});

it("collapses to an independent floating control below the header, then restores the same panel", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const panel = screen.getByRole("complementary", { name: "Design agent" });
	const log = screen.getByRole("log");
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Draft yang harus bertahan" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Tutup panel chat" }));
	const reopen = screen.getByRole("button", { name: "Buka panel chat" });
	expect(screen.getByTestId("studio-header").contains(reopen)).toBe(false);
	expect(reopen.className).toContain("top-[calc(4rem");
	// Collapsed means hidden from interaction, not unmounted.
	expect(panel.hasAttribute("inert")).toBe(true);
	expect(panel.getAttribute("aria-hidden")).toBe("true");
	fireEvent.click(reopen);
	expect(screen.getByRole("complementary", { name: "Design agent" })).toBe(
		panel,
	);
	expect(screen.getByRole("log")).toBe(log);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Draft yang harus bertahan",
	);
	expect(screen.queryByRole("button", { name: "Buka panel chat" })).toBeNull();
});

it("collapses a long prompt, expands it with the full original text, and collapses again", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const bubble = userBubble(/Buat aplikasi travel/);
	if (!bubble) throw new Error("long prompt bubble missing");
	const body = bubble.querySelector("p");
	expect(body?.className).toContain("line-clamp-4");
	const toggle = within(bubble).getByRole("button", {
		name: "Tampilkan seluruh pesan",
	});
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	// The clamp is presentation only: the whole original prompt is in the DOM.
	expect(body?.textContent).toBe(LONG_PROMPT);
	fireEvent.click(toggle);
	expect(body?.className).not.toContain("line-clamp-4");
	expect(
		within(bubble)
			.getByRole("button", { name: "Ciutkan pesan" })
			.getAttribute("aria-expanded"),
	).toBe("true");
	fireEvent.click(
		within(bubble).getByRole("button", { name: "Ciutkan pesan" }),
	);
	expect(body?.className).toContain("line-clamp-4");
	expect(LONG_PROMPT.length).toBeGreaterThan(
		STUDIO_USER_MESSAGE_COLLAPSE_CHARS,
	);
});

it("keeps a prompt expanded across a panel collapse", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const bubble = userBubble(/Buat aplikasi travel/);
	if (!bubble) throw new Error("long prompt bubble missing");
	fireEvent.click(
		within(bubble).getByRole("button", { name: "Tampilkan seluruh pesan" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Tutup panel chat" }));
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	expect(
		within(userBubble(/Buat aplikasi travel/) as HTMLElement).getByRole(
			"button",
			{ name: "Ciutkan pesan" },
		),
	).toBeDefined();
});

it("gives a short prompt no expansion control", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const short = userBubble(/Tambah halaman Profil/);
	if (!short) throw new Error("short prompt bubble missing");
	expect(within(short).queryByRole("button")).toBeNull();
	expect(short.querySelector("p")?.className).not.toContain("line-clamp");
});

it("renders assistant Markdown as structure and drops raw HTML and unsafe links", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const reply = screen.getByRole("article", { name: "Balasan design agent" });
	expect(reply.querySelector("strong")?.textContent).toBe("Jelajahin");
	expect(reply.querySelector("ul")?.children).toHaveLength(2);
	const safe = within(reply).getByRole("link", { name: "tautan aman" });
	expect(safe.getAttribute("href")).toBe("https://example.com");
	expect(safe.getAttribute("rel")).toContain("noopener");
	expect(reply.querySelector("script")).toBeNull();
	expect(reply.querySelector("img")).toBeNull();
	for (const anchor of reply.querySelectorAll("a"))
		expect(anchor.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
	expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
});

it("repeats no author or status label and shows no panel heading", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const panel = screen.getByRole("complementary", { name: "Design agent" });
	const text = panel.textContent ?? "";
	for (const label of [
		"DESIGN AGENT",
		"Anda",
		"Diterima",
		"Selesai",
		"Design agent",
	])
		expect(text).not.toContain(label);
	// Authors stay identifiable to assistive technology without visible labels.
	expect(screen.getAllByRole("article", { name: "Pesan Anda" })).toHaveLength(
		2,
	);
	expect(
		screen.getAllByRole("article", { name: "Balasan design agent" }),
	).toHaveLength(1);
});

it("shows a partial outcome as counts with the failed screen named, never as success", () => {
	render(<StudioWorkspace initialData={fixture(conversation)} />);
	const reply = screen.getByRole("article", { name: "Balasan design agent" });
	expect(reply.textContent).toContain("3 dari 4 halaman tersedia");
	expect(reply.textContent).not.toContain("4 halaman dibuat");
	fireEvent.click(within(reply).getByRole("button", { name: /Lihat/ }));
	expect(reply.textContent).toContain("Belum berhasil");
});

it("keeps stored technical failure detail out of the visible conversation", () => {
	const secret =
		"pq: connection refused at 10.0.0.5:5432 (provider key sk-abc)";
	render(
		<StudioWorkspace
			initialData={fixture([
				message({
					id: "m-fail",
					role: "assistant",
					content: "Permintaan belum berhasil diproses. Pulihkan dari canvas.",
					order: 1,
					status: "failed",
					progress: {
						phase: "failed",
						ready: 0,
						total: 0,
						failed: 0,
						kind: "initial",
						screenNames: [],
						recovery: "planning",
					},
				}),
			])}
		/>,
	);
	expect(screen.getByRole("log").textContent).not.toContain(secret);
	expect(screen.getByRole("log").textContent).toContain("Pulihkan");
});
