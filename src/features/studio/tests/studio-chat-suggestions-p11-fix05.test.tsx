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
import { resetStudioThumbnailCache } from "../hooks/use-studio-thumbnail";
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
	StudioCanvas: () => <section aria-label="Canvas" />,
}));

const date = new Date("2026-01-01");

function frameRow(
	id: string,
	name: string,
	description: string,
	order: number,
) {
	return {
		id,
		projectId: "p1",
		name,
		description,
		viewport: "web",
		htmlCode: "<body><h1>x</h1></body>",
		status: "ready",
		order,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		originJobId: id === "f1" ? "job-1" : "job-2",
		initialSlot: 0,
		revision: 1,
		lastJobId: id === "f1" ? "job-1" : "job-2",
		createdAt: date,
		updatedAt: date,
	};
}

function progress(names: string[], ids: string[], kind: string) {
	return {
		phase: "completed",
		ready: names.length,
		total: names.length,
		failed: 0,
		kind,
		screenNames: names,
		recovery: null,
		frames: names.map((name, index) => ({
			frameId: ids[index] ?? "",
			name,
			viewport: "web",
			status: "ready",
			revision: 1,
		})),
	};
}

function fixture(): StudioDetailLoaderData {
	const data = studioStatusSchema.parse({
		project: {
			id: "p1",
			userId: "u1",
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
		frames: [
			frameRow(
				"f1",
				"Detail Paket",
				"Paket wisata dengan jadwal keberangkatan.",
				0,
			),
			frameRow(
				"f2",
				"Profil",
				"Lengkapi profil pengguna dengan data kontak.",
				1,
			),
		],
		activeJob: null,
		messages: [
			{
				id: "u1",
				projectId: "p1",
				userId: "u1",
				operationId: "op-1",
				jobIds: ["job-1"],
				role: "user",
				content: "Buat aplikasi travel booking dengan paket wisata.",
				order: 0,
				status: "accepted",
				attachments: [],
				progress: null,
				createdAt: date,
				updatedAt: date,
			},
			{
				id: "a1",
				projectId: "p1",
				userId: "u1",
				operationId: "op-1",
				jobIds: ["job-1"],
				role: "assistant",
				content: "Saya membuat **Detail Paket** untuk perjalanan wisata.",
				order: 1,
				status: "completed",
				attachments: [],
				progress: progress(["Detail Paket"], ["f1"], "initial"),
				createdAt: date,
				updatedAt: date,
			},
			{
				id: "u2",
				projectId: "p1",
				userId: "u1",
				operationId: "op-2",
				jobIds: ["job-2"],
				role: "user",
				content: "Tambahkan halaman Profil ke aplikasi travel ini.",
				order: 2,
				status: "accepted",
				attachments: [],
				progress: null,
				createdAt: date,
				updatedAt: date,
			},
			{
				id: "a2",
				projectId: "p1",
				userId: "u1",
				operationId: "op-2",
				jobIds: ["job-2"],
				role: "assistant",
				content: "Saya membuat halaman **Profil**.",
				order: 3,
				status: "completed",
				attachments: [],
				progress: progress(["Profil"], ["f2"], "add"),
				createdAt: date,
				updatedAt: date,
			},
		],
	});
	return { ...data, logoUrl: null, revisions: [], latest: null };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	resetStudioThumbnailCache();
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
	fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture())));
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const replies = () =>
	screen.getAllByRole("article", { name: "Balasan design agent" });
const log = () => screen.getByRole("log");

it("places suggestions inside the assistant result they belong to, not above the composer", () => {
	const view = render(<StudioWorkspace initialData={fixture()} />);
	const results = replies();
	expect(results).toHaveLength(2);
	const first = within(results[0] as HTMLElement).getByRole("region", {
		name: "Saran langkah berikutnya",
	});
	const second = within(results[1] as HTMLElement).getByRole("region", {
		name: "Saran langkah berikutnya",
	});
	expect(log().contains(first)).toBe(true);
	expect(log().contains(second)).toBe(true);
	expect(log().contains(screen.getByRole("textbox"))).toBe(false);
	expect(first.className).not.toMatch(/sticky|fixed|absolute/);
	const composer = screen.getByTestId("studio-composer");
	expect(composer.contains(first)).toBe(false);
	expect(
		within(results[0] as HTMLElement).getByRole("button", {
			name: "Simulasikan paket wisata yang kehabisan kuota",
		}),
	).toBeDefined();
	expect(
		within(results[1] as HTMLElement).getByRole("button", {
			name: "Uji validasi data kontak yang belum lengkap",
		}),
	).toBeDefined();
	view.unmount();
});

it("prefills the full editable prompt and attaches only the result's live frame", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const first = replies()[0] as HTMLElement;
	const suggestion = within(first).getByRole("button", {
		name: "Simulasikan paket wisata yang kehabisan kuota",
	});
	fireEvent.click(suggestion);

	const input = screen.getByRole("textbox");
	expect((input as HTMLTextAreaElement).value).toContain("state kuota habis");
	expect((input as HTMLTextAreaElement).value).toContain(
		"Jangan mengubah halaman lain.",
	);
	expect(screen.getByText("Editing: Detail Paket")).toBeDefined();
	expect(
		fetchMock.mock.calls.filter((call) => call[1]?.method === "POST"),
	).toHaveLength(0);

	fireEvent.change(input, {
		target: { value: "Ubah warna tombol pemesanan." },
	});
	expect((input as HTMLTextAreaElement).value).toBe(
		"Ubah warna tombol pemesanan.",
	);
});

it("keeps a second result's suggestions distinct after reopening the panel", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const second = replies()[1] as HTMLElement;
	const before = within(second)
		.getAllByRole("button")
		.map((button) => button.textContent);
	fireEvent.click(screen.getByRole("button", { name: "Tutup panel chat" }));
	fireEvent.click(screen.getByRole("button", { name: "Buka panel chat" }));
	const after = within(replies()[1] as HTMLElement)
		.getAllByRole("button")
		.map((button) => button.textContent);
	expect(after).toEqual(before);
	expect(
		within(replies()[1] as HTMLElement).queryByRole("button", {
			name: "Simulasikan paket wisata yang kehabisan kuota",
		}),
	).toBeNull();
});

it("keeps no redundant chat icon in the open header and keeps the reopen control", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const panel = screen.getByRole("complementary", { name: "Design agent" });
	const close = within(panel).getByRole("button", { name: "Tutup panel chat" });
	expect(close.parentElement?.querySelectorAll("svg")).toHaveLength(1);
	expect(
		within(panel).queryByRole("button", { name: "Buka panel chat" }),
	).toBeNull();
	fireEvent.click(close);
	const reopen = screen.getByRole("button", { name: "Buka panel chat" });
	expect(reopen.querySelectorAll("svg")).toHaveLength(1);
	fireEvent.click(reopen);
	expect(screen.getByRole("complementary", { name: "Design agent" })).toBe(
		panel,
	);
});

it("preserves Markdown and result cards from the previous chat fix", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const first = replies()[0] as HTMLElement;
	expect(first.querySelector("strong")?.textContent).toBe("Detail Paket");
	const results = within(first).getByRole("region", { name: "Hasil desain" });
	expect(
		within(results).getByRole("button", { name: /^Detail Paket, Web UI/ }),
	).toBeDefined();
});
