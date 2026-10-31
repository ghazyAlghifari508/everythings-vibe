// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ApiKeysClient,
	isObsoleteKey,
} from "../components/settings/api-keys-client";
import type { ApiKeyRecord } from "../types/api-key-contracts";

const manualKey: ApiKeyRecord = {
	id: "key-1",
	name: "Claude Code CLI",
	key_prefix: "vibe_a1b2c",
	scopes: ["read:project", "write:task:status"],
	last_used_at: "2026-10-20T10:00:00.000Z",
	created_at: "2026-10-15T08:00:00.000Z",
	expires_at: null,
	source: "manual",
	state: "no-expiry",
};

const unboundedAutoKey: ApiKeyRecord = {
	...manualKey,
	id: "key-legacy",
	name: "auto-cli-1730000000000",
	key_prefix: "vibe_l3gac",
	source: "automatic",
};

const expiredKey: ApiKeyRecord = {
	...manualKey,
	id: "key-expired",
	name: "Short lived agent",
	key_prefix: "vibe_exp1re",
	expires_at: "2026-10-01T08:00:00.000Z",
	source: "automatic",
	state: "expired",
};

describe("ApiKeysClient layout and presentation", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("renders inside SettingsContentPanel with canonical header and empty state when keys are empty", () => {
		render(<ApiKeysClient keys={[]} />);

		const heading = screen.getByRole("heading", {
			level: 2,
			name: /api keys/i,
		});
		expect(heading).toBeDefined();
		expect(
			screen.getByText("Kelola API key untuk MCP server dan CLI tool."),
		).toBeDefined();

		// Action button in the canonical panel header
		const createButton = screen.getByRole("button", {
			name: /buat api key baru/i,
		});
		expect(createButton).toBeDefined();

		// Empty state presentation
		expect(screen.getByText("Belum ada API key")).toBeDefined();
		expect(
			screen.getByText(
				"Buat API key baru untuk menghubungkan CLI tool atau MCP server ke workspace kamu.",
			),
		).toBeDefined();

		// Security note
		expect(
			screen.getByText(/API keys hanya ditampilkan sekali saat pembuatan/i),
		).toBeDefined();

		// Verify outer container is SettingsContentPanel
		const panel = screen.getByTestId("settings-content-panel");
		expect(panel.className).toContain("w-full");
		expect(panel.className).toContain("rounded-xl");
	});

	it("renders key table when keys exist", () => {
		render(<ApiKeysClient keys={[manualKey]} />);

		expect(screen.getByText("Claude Code CLI")).toBeDefined();
		expect(screen.getByText("vibe_a1b2c...")).toBeDefined();
		expect(screen.getByText("read:project")).toBeDefined();
		expect(screen.getByText("write:task:status")).toBeDefined();

		// Table headers
		expect(screen.getByText("Nama")).toBeDefined();
		expect(screen.getByText("Prefix")).toBeDefined();
		expect(screen.getByText("Scopes")).toBeDefined();
		expect(screen.getByText("Last Used")).toBeDefined();
		expect(screen.getByText("Created")).toBeDefined();
		expect(screen.getByText("Expires")).toBeDefined();
		expect(screen.getByText("Aksi")).toBeDefined();
	});

	it("keeps a manual key without expiry out of the obsolete pile", () => {
		render(<ApiKeysClient keys={[manualKey]} />);

		// A hand-written long-lived key is intentional, so no housekeeping
		// control may claim it.
		expect(screen.getByText("Dibuat manual")).toBeDefined();
		expect(screen.getByText("Never")).toBeDefined();
		expect(isObsoleteKey(manualKey)).toBe(false);
		expect(screen.queryByRole("button", { name: /bersihkan/i })).toBeNull();
	});

	it("flags an unbounded automatic handoff key as obsolete and offers cleanup", () => {
		render(<ApiKeysClient keys={[unboundedAutoKey]} />);

		expect(screen.getByText("Handoff otomatis")).toBeDefined();
		expect(screen.getByText("Usang")).toBeDefined();
		expect(isObsoleteKey(unboundedAutoKey)).toBe(true);
		expect(
			screen.getByRole("button", { name: /bersihkan 1 key usang/i }),
		).toBeDefined();
	});

	it("labels an expired credential as expired and counts it for cleanup", () => {
		render(<ApiKeysClient keys={[expiredKey]} />);

		expect(screen.getByText("Kedaluwarsa")).toBeDefined();
		expect(isObsoleteKey(expiredKey)).toBe(true);
	});

	it("allows hiding and revealing the one-time credential without losing it", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					Response.json({ id: "new-key", rawKey: "vibe_ui_fixture" }),
				),
		);
		render(<ApiKeysClient keys={[]} />);
		fireEvent.click(screen.getByRole("button", { name: /buat api key baru/i }));
		fireEvent.change(screen.getByLabelText("Nama"), {
			target: { value: "Sample CLI" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Buat Key" }));
		await waitFor(() =>
			expect(screen.getByText("vibe_ui_fixture")).toBeDefined(),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Sembunyikan API key" }),
		);
		expect(screen.queryByText("vibe_ui_fixture")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Tampilkan API key" }));
		expect(screen.getByText("vibe_ui_fixture")).toBeDefined();
	});

	it("opens the create modal dialog when clicking create button", () => {
		render(<ApiKeysClient keys={[]} />);

		const createButton = screen.getByRole("button", {
			name: /buat api key baru/i,
		});
		fireEvent.click(createButton);

		expect(
			screen.getByRole("heading", { name: "Buat API Key Baru" }),
		).toBeDefined();
		expect(screen.getByLabelText("Nama")).toBeDefined();
		expect(screen.getByText("Scope")).toBeDefined();
	});
});
