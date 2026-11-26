// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkspace } from "../components/workspace/studio-workspace";
import { resetStudioThumbnailCache } from "../hooks/use-studio-thumbnail";
import type { StudioDetailLoaderData } from "../types/studio";
import { studioStatusSchema } from "../types/studio-status";

const canvas = vi.hoisted(() => ({
	props: [] as {
		selectedFrameId?: string | null;
		focusRequest?: { frameId: string; nonce: number } | null;
	}[],
}));
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
	StudioCanvas: (props: (typeof canvas.props)[number]) => {
		canvas.props.push(props);
		return <section aria-label="Canvas" />;
	},
}));

const date = new Date("2026-01-01");
const frameRow = (id: string, name: string) => ({
	id,
	projectId: "p1",
	name,
	description: null,
	viewport: "web",
	htmlCode: "<body><h1>x</h1></body>",
	status: "ready",
	order: id === "f1" ? 0 : 1,
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
});
function fixture(): StudioDetailLoaderData {
	const data = studioStatusSchema.parse({
		project: {
			id: "p1",
			userId: "u",
			title: "Jelajahin — Domestic Travel Booking App",
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
		frames: [frameRow("f1", "Jelajah"), frameRow("f2", "Profil")],
		activeJob: null,
		messages: [
			{
				id: "m1",
				projectId: "p1",
				userId: "u",
				operationId: "op",
				jobIds: ["j"],
				role: "assistant",
				content: `**Layar Profil**\n\n${"Kalimat panjang yang membungkus dengan wajar. ".repeat(60)}\n\n<script>window.pwned=1</script>\n\n---\n\n# Judul Raksasa`,
				order: 1,
				status: "completed",
				attachments: [],
				progress: {
					phase: "completed",
					ready: 2,
					total: 2,
					failed: 0,
					kind: "initial",
					screenNames: ["Jelajah", "Profil"],
					recovery: null,
					frames: [
						{
							frameId: "f1",
							name: "Jelajah",
							viewport: "web",
							status: "ready",
							revision: 1,
						},
						{
							frameId: "f2",
							name: "Profil",
							viewport: "web",
							status: "ready",
							revision: 1,
						},
					],
				},
				createdAt: date,
				updatedAt: date,
			},
		],
	});
	return { ...data, logoUrl: null, revisions: [], latest: null };
}

beforeEach(() => {
	canvas.props = [];
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
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("{}", { status: 404 })),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("opening a result row selects that frame and asks the canvas to focus exactly it", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const last = () => canvas.props.at(-1);
	expect(last()?.focusRequest ?? null).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /^Profil, Web UI/ }));
	expect(last()?.selectedFrameId).toBe("f2");
	expect(last()?.focusRequest).toMatchObject({ frameId: "f2", nonce: 1 });
	fireEvent.click(screen.getByRole("button", { name: /^Jelajah, Web UI/ }));
	expect(last()?.selectedFrameId).toBe("f1");
	expect(last()?.focusRequest).toMatchObject({ frameId: "f1", nonce: 2 });
	// Re-opening the same row is a fresh request, so the camera moves back.
	fireEvent.click(screen.getByRole("button", { name: /^Jelajah, Web UI/ }));
	expect(last()?.focusRequest?.nonce).toBe(3);
});

it("renders a long message with safe Markdown inside the scrolling log, leaving the composer reachable", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const log = screen.getByRole("log");
	expect(log.className).toContain("overflow-y-auto");
	expect(log.className).toContain("min-h-0");
	const reply = screen.getByRole("article", { name: "Balasan design agent" });
	expect(reply.querySelector("script")).toBeNull();
	expect(reply.querySelector("hr")).toBeNull();
	expect(reply.textContent).not.toContain("window.pwned=1</script>");
	// The composer is a sibling of the log, so long content cannot push it away.
	expect(log.contains(screen.getByRole("textbox"))).toBe(false);
	expect(Reflect.get(window, "pwned")).toBeUndefined();
});

it("keeps the long project title out of result rows and keeps the screen name distinct", () => {
	render(<StudioWorkspace initialData={fixture()} />);
	const card = screen.getByRole("region", { name: "Hasil desain" });
	expect(card.textContent).not.toContain("Domestic Travel Booking App");
	expect(card.textContent).toContain("Profil");
});
