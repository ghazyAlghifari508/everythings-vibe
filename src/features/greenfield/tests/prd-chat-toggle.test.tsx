// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavbarFlowActions } from "@/components/layout/navbar-flow-actions";
import { PrdDetail } from "@/features/greenfield/components/prd/prd-detail";
import { PRD_CHAT_PANEL_ID } from "@/features/greenfield/types/greenfield-constants";
import { useChatStore, useUIStore } from "@/store";

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/">{children}</a>
	),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	useLocation: () => ({}),
}));
vi.mock("@/features/greenfield/services/ask-loader.functions", () => ({
	loadAsk: vi.fn(),
}));
vi.mock("@/features/billing/components/credit-exhausted-modal", () => ({
	CreditExhaustedModal: () => null,
}));
vi.mock("@/features/greenfield/components/generation-progress", () => ({
	GenerationProgress: () => null,
}));
vi.mock("@/features/greenfield/components/prd/prd-viewer", () => ({
	PrdViewer: () => <div data-testid="prd-viewer" />,
}));
vi.mock("@/features/greenfield/hooks/use-prd-detail", () => ({
	usePrdDetail: () => ({
		currentContent: "# PRD",
		handlePrdRevised: vi.fn(),
		handleVersionSelect: vi.fn(),
		mappedVersions: [],
		selectedVersionNum: 1,
		streamingForView: "",
	}),
}));
// Stand-in for the single stream owner: mount/unmount counters expose any
// remount (which would abort/restart a real stream), local state holds a draft.
vi.mock("@/features/greenfield/components/chat/chat-panel", () => ({
	ChatPanel: () => {
		const [draft, setDraft] = useState("");
		useEffect(() => {
			lifecycle.mounts += 1;
			return () => {
				lifecycle.unmounts += 1;
			};
		}, []);
		return (
			<textarea
				aria-label="draft"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
			/>
		);
	},
}));

const project = {
	projectId: "p1",
	step: "prd",
	acStatus: "pending",
	featuresStatus: "completed",
	hasPrd: true,
	hasAc: false,
	hasTasks: false,
} as const;

function Page() {
	return (
		<>
			<NavbarFlowActions
				pathname="/vibeplan/p1/prd"
				projectId="p1"
				project={project}
				isFree={false}
			/>
			<PrdDetail projectId="p1" step="prd" plan="pro" />
		</>
	);
}

const trigger = () => {
	const el = document.querySelector(
		`button[aria-controls="${PRD_CHAT_PANEL_ID}"]`,
	);
	if (!el) throw new Error("Navbar Chat trigger missing");
	return el;
};
const panel = () => document.getElementById(PRD_CHAT_PANEL_ID);

beforeEach(() => {
	lifecycle.mounts = 0;
	lifecycle.unmounts = 0;
	useUIStore.setState({ isChatPanelOpen: true });
	useChatStore.getState().resetChat();
	window.sessionStorage.clear();
});
afterEach(cleanup);

describe("PRD chat toggle contract", () => {
	it("the Navbar trigger and the panel read the same store state", async () => {
		const user = userEvent.setup();
		render(<Page />);

		expect(trigger().getAttribute("aria-expanded")).toBe("true");
		expect(trigger().getAttribute("aria-controls")).toBe(PRD_CHAT_PANEL_ID);
		expect(panel()?.getAttribute("data-state")).toBe("open");

		await user.click(trigger());

		expect(useUIStore.getState().isChatPanelOpen).toBe(false);
		expect(trigger().getAttribute("aria-expanded")).toBe("false");
		expect(panel()?.getAttribute("data-state")).toBe("closed");

		await user.click(trigger());

		expect(useUIStore.getState().isChatPanelOpen).toBe(true);
		expect(trigger().getAttribute("aria-expanded")).toBe("true");
		expect(panel()?.getAttribute("data-state")).toBe("open");
	});

	it("a closed panel exposes no resize hitbox", async () => {
		const user = userEvent.setup();
		render(<Page />);
		const hitbox = () =>
			panel()?.querySelector('[aria-hidden="true"].cursor-col-resize');

		expect(hitbox()).not.toBeNull();
		await user.click(trigger());
		expect(hitbox()).toBeNull();
		await user.click(trigger());
		expect(hitbox()).not.toBeNull();
	});

	it("repeated toggling keeps one mounted chat owner and its draft", async () => {
		const user = userEvent.setup();
		render(<Page />);
		await user.type(screen.getByLabelText("draft"), "revisi bagian goals");

		for (let i = 0; i < 4; i += 1) await user.click(trigger());

		expect(lifecycle.mounts).toBe(1);
		expect(lifecycle.unmounts).toBe(0);
		expect(screen.getAllByLabelText("draft")).toHaveLength(1);
		expect((screen.getByLabelText("draft") as HTMLTextAreaElement).value).toBe(
			"revisi bagian goals",
		);
	});

	it("the internal tablet close button drives the same state as the Navbar", () => {
		render(<Page />);
		fireEvent.click(screen.getByRole("button", { name: "Tutup chat" }));
		expect(useUIStore.getState().isChatPanelOpen).toBe(false);
		expect(trigger().getAttribute("aria-expanded")).toBe("false");
	});

	it("the mobile Chat tab never touches the desktop visibility state", () => {
		render(<Page />);
		useUIStore.setState({ isChatPanelOpen: false });
		const tabs = screen.getAllByRole("button", { name: "Chat" });
		const mobileTab = tabs.find((el) => el !== trigger());
		if (!mobileTab) throw new Error("mobile Chat tab missing");
		fireEvent.click(mobileTab);
		expect(useUIStore.getState().isChatPanelOpen).toBe(false);
		expect(lifecycle.mounts).toBe(1);
	});
});
