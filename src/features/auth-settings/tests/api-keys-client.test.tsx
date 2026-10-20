// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiKeysClient } from "../components/settings/api-keys-client";

describe("ApiKeysClient layout and presentation", () => {
	afterEach(() => {
		cleanup();
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
		const sampleKeys = [
			{
				id: "key-1",
				name: "Claude Code CLI",
				key_prefix: "vibe_a1b2c",
				scopes: ["read:project", "write:task:status"],
				last_used_at: "2026-10-20T10:00:00.000Z",
				created_at: "2026-10-15T08:00:00.000Z",
				expires_at: null,
			},
		];

		render(<ApiKeysClient keys={sampleKeys} />);

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
		expect(screen.getByText("Aksi")).toBeDefined();
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
