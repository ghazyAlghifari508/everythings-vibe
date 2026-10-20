// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsContentPanel } from "../components/settings/settings-content-panel";

describe("SettingsContentPanel primitive", () => {
	afterEach(() => {
		cleanup();
	});
	it("renders title, optional description, optional actions slot, and children", () => {
		render(
			<SettingsContentPanel
				title="Pengaturan Profil"
				description="Kelola informasi akun kamu di sini."
				actions={<button type="button">Aksi Utama</button>}
			>
				<p>Konten Pengaturan</p>
			</SettingsContentPanel>,
		);

		const heading = screen.getByRole("heading", {
			level: 2,
			name: /pengaturan profil/i,
		});
		expect(heading).toBeDefined();
		expect(heading.className).toContain("font-inter");
		expect(heading.className).toContain("text-xl");

		expect(
			screen.getByText("Kelola informasi akun kamu di sini."),
		).toBeDefined();
		expect(screen.getByRole("button", { name: /aksi utama/i })).toBeDefined();
		expect(screen.getByText("Konten Pengaturan")).toBeDefined();
	});

	it("applies canonical max-w-4xl surface and border styling", () => {
		render(
			<SettingsContentPanel title="Test Panel">
				<div>Content</div>
			</SettingsContentPanel>,
		);

		const panel = screen.getByTestId("settings-content-panel");
		expect(panel.className).toContain("max-w-4xl");
		expect(panel.className).toContain("rounded-xl");
		expect(panel.className).toContain("border");
		expect(panel.className).toContain("p-6");
	});

	it("renders without description or actions gracefully", () => {
		render(
			<SettingsContentPanel title="Simple Title">
				<span>Inner</span>
			</SettingsContentPanel>,
		);

		expect(
			screen.getByRole("heading", { level: 2, name: /simple title/i }),
		).toBeDefined();
		expect(screen.getByText("Inner")).toBeDefined();
	});
});
