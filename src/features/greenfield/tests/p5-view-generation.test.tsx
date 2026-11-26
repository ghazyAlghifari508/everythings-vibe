// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFeatureTree } from "@/db/schema";
import { FiturDetail } from "@/features/greenfield/components/feature-tree/feature-tree-detail";
import { PrdDetail } from "@/features/greenfield/components/prd/prd-detail";
import { TaskDetail } from "@/features/greenfield/components/task/task-detail";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import { useChatStore, useUIStore } from "@/store";

const world = vi.hoisted(() => ({
	task: {
		generatedTaskTree: null as TaskTree | null,
		handleGenerate: () => {},
		hasError: false,
		isGenerating: true,
		revealCount: null as number | null,
	},
	prdStreamingForView: "",
	chatPanelMounts: 0,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/vibeplan/p1/kanban">{children}</a>
	),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	useLocation: ({ select }: { select?: (l: unknown) => unknown }) =>
		select?.({ search: {}, searchStr: "" }),
	useBlocker: () => {},
}));

vi.mock("@/features/greenfield/hooks/use-task-generation", () => ({
	useTaskGeneration: () => world.task,
}));

vi.mock("@/features/greenfield/hooks/use-prd-detail", () => ({
	usePrdDetail: () => ({
		currentContent: "# PRD tersimpan",
		handlePrdRevised: vi.fn(),
		handleVersionSelect: vi.fn(),
		mappedVersions: [],
		selectedVersionNum: 1,
		streamingForView: world.prdStreamingForView,
	}),
}));

vi.mock("@/features/greenfield/components/prd/prd-viewer", () => ({
	PrdViewer: ({ content }: { content: string }) => (
		<div data-testid="prd-viewer">{content}</div>
	),
}));

vi.mock("@/features/greenfield/components/chat/chat-panel", () => ({
	ChatPanel: () => {
		world.chatPanelMounts += 1;
		return <div data-testid="chat-panel" />;
	},
}));

vi.mock("@/features/billing/components/credit-exhausted-modal", () => ({
	CreditExhaustedModal: () => null,
}));

vi.mock(
	"@/features/greenfield/components/documents/document-review-modal",
	() => ({
		DocumentReviewModal: () => null,
	}),
);

vi.mock(
	"@/features/greenfield/components/documents/project-documents-drawer",
	() => ({
		ProjectDocumentsDrawer: () => null,
	}),
);

vi.mock("@/features/greenfield/components/task/implementation-options", () => ({
	ImplementationOptions: ({ hasContent }: { hasContent: boolean }) => (
		<button type="button" disabled={!hasContent}>
			Options
		</button>
	),
}));

const FEATURE_TREE: ProjectFeatureTree = {
	productName: "Toko",
	createdAt: "2026-01-01T00:00:00.000Z",
	features: [
		{
			id: "f1",
			name: "Autentikasi",
			phase: 1,
			description: "Login",
			subfeatures: [],
		},
	],
};

const TASK_TREE: TaskTree = {
	features: [
		{
			name: "Autentikasi",
			tasks: [
				{
					name: "Login",
					description: "Form login",
					priority: "high",
					covers: [],
					surfaces: [],
					subtasks: [],
				},
			],
		},
	],
};

beforeEach(() => {
	world.task = {
		generatedTaskTree: null,
		handleGenerate: vi.fn(),
		hasError: false,
		isGenerating: true,
		revealCount: null,
	};
	world.prdStreamingForView = "";
	world.chatPanelMounts = 0;
	useChatStore.getState().resetChat();
	useUIStore.setState({ isChatPanelOpen: false });
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("P5 Feature Tree generation", () => {
	it("keeps the skeleton canvas and one topbar status, then switches to real nodes", () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));
		const { rerender } = render(
			<FiturDetail
				projectId="p1"
				projectName="Toko"
				featureTree={null}
				featuresStatus="generating"
			/>,
		);

		expect(screen.getByRole("heading", { name: "Feature Tree" })).toBeTruthy();
		expect(screen.getAllByRole("status")).toHaveLength(1);
		expect(screen.getByText("Menyusun daftar fitur...")).toBeTruthy();
		const canvas = screen.getByRole("region", {
			name: "Kanvas peta fitur Toko",
		});
		expect(canvas.getAttribute("aria-busy")).toBe("true");
		expect(document.body.textContent).not.toMatch(
			/AI sedang menyusun|berpikir|menganalisis|\d+\.\d+s/i,
		);

		rerender(
			<FiturDetail
				projectId="p1"
				projectName="Toko"
				featureTree={FEATURE_TREE}
				featuresStatus="completed"
			/>,
		);
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByText("Autentikasi")).toBeTruthy();
		expect(canvas.getAttribute("aria-busy")).toBe("false");
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe("P5 Task Breakdown generation", () => {
	it("keeps the skeleton canvas, static title and one status; no raw thinking heading", () => {
		const { rerender } = render(
			<TaskDetail
				projectId="p1"
				projectName="Toko"
				taskTree={null}
				featureTree={null}
				hasAc
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "Task Breakdown" }),
		).toBeTruthy();
		expect(screen.getAllByRole("status")).toHaveLength(1);
		expect(screen.getByText("Menyusun task...")).toBeTruthy();
		expect(document.body.textContent).not.toMatch(
			/AI sedang|berpikir|thinking/i,
		);
		const canvas = screen.getByRole("region", { name: "Kanvas diagram task" });
		expect(canvas.getAttribute("aria-busy")).toBe("true");
		expect(screen.getByRole("link", { name: "Task" })).toBeTruthy();

		world.task = {
			...world.task,
			generatedTaskTree: TASK_TREE,
			isGenerating: false,
		};
		rerender(
			<TaskDetail
				projectId="p1"
				projectName="Toko"
				taskTree={TASK_TREE}
				featureTree={null}
				hasAc
			/>,
		);
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getAllByText("Login").length).toBeGreaterThan(0);
		expect(canvas.getAttribute("aria-busy")).toBe("false");
		expect(screen.getByRole("button", { name: "Options" })).toBeTruthy();
	});
});

describe("P5 PRD single indicator", () => {
	function renderPrd() {
		return render(<PrdDetail projectId="p1" step="prd" plan="pro" />);
	}

	beforeEach(() => {
		useChatStore.setState({ isGeneratingPRD: true, streamingPRDContent: "" });
	});

	it("never overlays the canvas with loading copy or a spinner", () => {
		useUIStore.setState({ isChatPanelOpen: true });
		renderPrd();
		expect(screen.queryByText("Menyusun PRD...")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByTestId("chat-panel")).toBeTruthy();
	});

	it("keeps the canvas copy-free when the chat panel is closed", () => {
		useUIStore.setState({ isChatPanelOpen: false });
		renderPrd();
		expect(screen.queryByText("Menyusun PRD...")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("renders the first token into the document canvas", () => {
		renderPrd();
		act(() => {
			world.prdStreamingForView = "## Overview";
			useChatStore.setState({ streamingPRDContent: "## Overview" });
		});
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByTestId("prd-viewer").textContent).toContain("Overview");
	});

	it("stays copy-free across the mobile Dokumen/Chat tabs", () => {
		renderPrd();
		fireEvent.click(screen.getByRole("button", { name: "Chat" }));
		expect(screen.queryByText("Menyusun PRD...")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("does not remount the stream owner when the panel toggles", () => {
		renderPrd();
		const mounted = world.chatPanelMounts;
		act(() => {
			useUIStore.setState({ isChatPanelOpen: true });
			useUIStore.setState({ isChatPanelOpen: false });
		});
		expect(world.chatPanelMounts).toBe(mounted);
	});

	it("shows saved content when the stream ends without a valid token", () => {
		useChatStore.setState({ isGeneratingPRD: false, streamingPRDContent: "" });
		renderPrd();
		expect(screen.queryByText("Menyusun PRD...")).toBeNull();
		expect(screen.getByTestId("prd-viewer").textContent).toContain(
			"PRD tersimpan",
		);
	});
});
