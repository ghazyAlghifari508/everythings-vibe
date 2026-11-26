// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseChatWorkspaceHeader } from "../components/chat/codebase-chat-workspace-header";
import { WorkspaceHeader } from "../components/workspace/workspace-header";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
		style,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
		style?: React.CSSProperties;
	}) => (
		<a href={to} className={className} style={style}>
			{children}
		</a>
	),
}));

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
		const current = root;
		act(() => {
			current.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

describe("WorkspaceHeader component", () => {
	it("renders repository name as plain text without card or badge wrapper", () => {
		const onResync = vi.fn();
		act(() => {
			root?.render(
				<WorkspaceHeader
					name="Ghazy Portofolio"
					isStarting={false}
					fileCount={42}
					onResync={onResync}
				/>,
			);
		});

		const repoNameEl = container.querySelector(
			"[data-testid='codebase-workspace-repo-name']",
		);
		expect(repoNameEl).not.toBeNull();
		expect(repoNameEl?.textContent).toBe("Ghazy Portofolio");

		// Plain text presentation: no badge container with border or card styling
		const classList = repoNameEl?.className ?? "";
		expect(classList).toContain("truncate");
		expect(classList).not.toContain("border");
		expect(classList).not.toContain("bg-obsidian");
		expect(classList).not.toContain("rounded");

		// Separator and logo present
		expect(container.textContent).toContain("/");
		expect(container.textContent).toContain("everythings-vibe");
	});

	it("preserves long repository names with title attribute and truncation", () => {
		const longRepoName =
			"very-long-repository-name-with-multiple-segments-that-could-overflow-the-header";
		act(() => {
			root?.render(
				<WorkspaceHeader
					name={longRepoName}
					isStarting={false}
					fileCount={12}
					onResync={vi.fn()}
				/>,
			);
		});

		const repoNameEl = container.querySelector(
			"[data-testid='codebase-workspace-repo-name']",
		);
		expect(repoNameEl?.getAttribute("title")).toBe(longRepoName);
		expect(repoNameEl?.textContent).toBe(longRepoName);
		expect(repoNameEl?.className).toContain("truncate");
	});

	it("preserves resync action and triggers onResync when clicked", () => {
		const onResync = vi.fn();
		act(() => {
			root?.render(
				<WorkspaceHeader
					name="everythings-vibe"
					isStarting={false}
					fileCount={69}
					onResync={onResync}
				/>,
			);
		});

		const resyncBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-resync-action']",
		);
		expect(resyncBtn).not.toBeNull();
		expect(resyncBtn?.textContent).toContain("Sync ulang");
		expect(resyncBtn?.disabled).toBe(false);

		act(() => {
			resyncBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onResync).toHaveBeenCalledTimes(1);

		// Badge displays synchronized files
		const syncBadge = container.querySelector(
			"[data-testid='codebase-sync-badge']",
		);
		expect(syncBadge?.textContent).toBe("69 file tersinkron");
	});

	it("disables resync button and indicates pending state when isStarting is true", () => {
		act(() => {
			root?.render(
				<WorkspaceHeader
					name="everythings-vibe"
					isStarting={true}
					fileCount={null}
					onResync={vi.fn()}
				/>,
			);
		});

		const resyncBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-resync-action']",
		);
		expect(resyncBtn?.disabled).toBe(true);
		expect(resyncBtn?.textContent).toContain("Menyiapkan...");

		const syncBadge = container.querySelector(
			"[data-testid='codebase-sync-badge']",
		);
		expect(syncBadge?.textContent).toBe("Menunggu snapshot");
	});

	it("ensures file count metadata is plain text with icon and not an interactive button", () => {
		act(() => {
			root?.render(
				<WorkspaceHeader
					name="Ghazy Portofolio"
					isStarting={false}
					fileCount={120}
					onResync={vi.fn()}
				/>,
			);
		});

		const syncBadge = container.querySelector(
			"[data-testid='codebase-sync-badge']",
		);
		expect(syncBadge).not.toBeNull();
		expect(syncBadge?.tagName.toLowerCase()).toBe("span");
		expect(syncBadge?.closest("button")).toBeNull();
		expect(syncBadge?.getAttribute("role")).not.toBe("button");
		expect(syncBadge?.getAttribute("tabindex")).toBeNull();
		expect(syncBadge?.textContent).toBe("120 file tersinkron");

		// Subtle file icon is present
		const icon = syncBadge?.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon?.getAttribute("aria-hidden")).toBe("true");
	});

	it("dynamically displays zero file count correctly", () => {
		act(() => {
			root?.render(
				<WorkspaceHeader
					name="Ghazy Portofolio"
					isStarting={false}
					fileCount={0}
					onResync={vi.fn()}
				/>,
			);
		});

		const syncBadge = container.querySelector(
			"[data-testid='codebase-sync-badge']",
		);
		expect(syncBadge?.textContent).toBe("0 file tersinkron");
	});
});

describe("CodebaseChatWorkspaceHeader component", () => {
	it("renders dynamic repository title and natural 'Workspace perencanaan' subtitle", () => {
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceHeader
					codebaseName="Ghazy Portofolio"
					featureName="Fitur Autentikasi"
					planSwitcher={
						<span data-testid="mock-plan-switcher">Plan Switcher</span>
					}
					kanbanProgress={null}
				/>,
			);
		});

		const titleEl = container.querySelector(
			"[data-testid='codebase-chat-title']",
		);
		const subtitleEl = container.querySelector(
			"[data-testid='codebase-chat-subtitle']",
		);

		expect(titleEl?.textContent).toBe("Ghazy Portofolio");
		// No redundant 'Workspace ·' prefix or middle dot in title
		expect(titleEl?.textContent).not.toContain("Workspace ·");
		expect(titleEl?.textContent).not.toContain("·");
		expect(titleEl?.getAttribute("title")).toBe("Ghazy Portofolio");

		expect(subtitleEl?.textContent).toBe("Workspace perencanaan");
		expect(
			container.querySelector("[data-testid='mock-plan-switcher']"),
		).not.toBeNull();
	});

	it("uses neutral 'Perencanaan codebase' title fallback when repository name is provisional or missing", () => {
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceHeader
					codebaseName="Repository Lokal"
					featureName="Fitur Pembayaran"
					planSwitcher={null}
					kanbanProgress={null}
				/>,
			);
		});

		const titleEl = container.querySelector(
			"[data-testid='codebase-chat-title']",
		);
		const subtitleEl = container.querySelector(
			"[data-testid='codebase-chat-subtitle']",
		);

		expect(titleEl?.textContent).toBe("Perencanaan codebase");
		expect(titleEl?.textContent).not.toContain("Repository Lokal");
		expect(titleEl?.textContent).not.toContain("Fitur Pembayaran");
		expect(subtitleEl?.textContent).toBe("Workspace perencanaan");
	});

	it("never substitutes feature plan name into repository identity", () => {
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceHeader
					codebaseName={undefined}
					featureName="Sistem Checkout Billing"
					planSwitcher={null}
					kanbanProgress={null}
				/>,
			);
		});

		const titleEl = container.querySelector(
			"[data-testid='codebase-chat-title']",
		);
		expect(titleEl?.textContent).toBe("Perencanaan codebase");
		expect(titleEl?.textContent).not.toContain("Sistem Checkout Billing");
	});

	it("renders actionable task progress button when progress is available", () => {
		const onOpenTaskProgress = vi.fn();
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceHeader
					codebaseName="Ghazy Portofolio"
					featureName="Fitur Baru"
					planSwitcher={null}
					kanbanProgress={{ done: 3, total: 5, pct: 60 }}
					onOpenTaskProgress={onOpenTaskProgress}
				/>,
			);
		});

		const progressBtn = container.querySelector(
			"[data-testid='codebase-kanban-badge']",
		) as HTMLButtonElement | null;
		expect(progressBtn).not.toBeNull();
		expect(progressBtn?.tagName.toLowerCase()).toBe("button");
		expect(progressBtn?.textContent).toContain("Progress task · 3/5 selesai");
		expect(progressBtn?.getAttribute("aria-label")).toContain(
			"Progress task · 3/5 selesai",
		);

		act(() => {
			progressBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onOpenTaskProgress).toHaveBeenCalledTimes(1);
	});

	it("does not render persistent banner in workspace header", () => {
		act(() => {
			root?.render(
				<CodebaseChatWorkspaceHeader
					codebaseName="Ghazy Portofolio"
					featureName="Fitur Baru"
					planSwitcher={null}
					kanbanProgress={null}
				/>,
			);
		});

		const notice = container.querySelector(
			"[data-testid='codebase-planning-review-notice']",
		);
		expect(notice).toBeNull();
	});
});
