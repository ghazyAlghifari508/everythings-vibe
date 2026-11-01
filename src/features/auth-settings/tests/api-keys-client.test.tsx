// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiKeysClient } from "../components/settings/api-keys-client";
import type { ApiKeyRecord } from "../types/api-key-contracts";
import { isObsoleteKey } from "../types/api-key-record";

const invalidate = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useRouter: () => ({ invalidate }),
}));

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

const automaticKey: ApiKeyRecord = {
	...manualKey,
	id: "key-auto",
	name: "auto-cli-1730000000000-abcd1234",
	key_prefix: "vibe_auto1",
	last_used_at: null,
	expires_at: "2026-12-01T08:00:00.000Z",
	source: "automatic",
	state: "active",
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

function advancedToggle() {
	return screen.getByRole("button", { name: /^pengaturan lanjutan/i });
}

function manualCreateButton() {
	return screen.getByRole("button", { name: /^buat api key manual$/i });
}

function openAdvanced() {
	fireEvent.click(advancedToggle());
}

describe("ApiKeysClient layout and presentation", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("frames the page as integration access, not credential generation", () => {
		render(<ApiKeysClient keys={[automaticKey]} />);

		expect(
			screen.getByRole("heading", { name: "Akses Integrasi" }),
		).toBeDefined();
		expect(screen.getByText("Kelola koneksi AI Agent dan CLI.")).toBeDefined();
		expect(
			screen.getByRole("heading", { name: /akses yang terdaftar/i }),
		).toBeDefined();

		// Manual creation must not be the panel-level primary action.
		const panel = screen.getByTestId("settings-content-panel");
		expect(
			screen.queryByRole("button", { name: /buat api key baru/i }),
		).toBeNull();
		expect(panel.className).toContain("rounded-xl");
	});

	it("explains automatic provisioning in the empty state without a create CTA", () => {
		render(<ApiKeysClient keys={[]} />);

		expect(screen.getByText("Belum ada akses terdaftar")).toBeDefined();
		expect(
			screen.getByText(/Akses untuk AI Agent dibuat otomatis/i),
		).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /^buat api key$/i }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: /buat api key baru/i }),
		).toBeNull();
		// Advanced entry stays discoverable and collapsed by default.
		expect(advancedToggle()).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /^buat api key manual$/i }),
		).toBeNull();
	});

	it("lists automatic and manual credentials with created, last used, status, and scopes", () => {
		render(<ApiKeysClient keys={[manualKey, automaticKey]} />);

		expect(screen.getByText("Claude Code CLI")).toBeDefined();
		expect(screen.getByText("auto-cli-1730000000000-abcd1234")).toBeDefined();
		expect(screen.getByText("Dibuat manual")).toBeDefined();
		expect(screen.getByText("Handoff otomatis")).toBeDefined();
		expect(screen.getByText("vibe_a1b2c…")).toBeDefined();
		expect(screen.getAllByText("read:project").length).toBeGreaterThan(0);
		expect(screen.getByText("Belum pernah")).toBeDefined();
		expect(screen.getByText(/Aktif sampai/)).toBeDefined();
		expect(screen.getByText("Aktif, tanpa batas waktu")).toBeDefined();
		expect(screen.getByText(/1 dari 2 akses berasal/i)).toBeDefined();

		expect(screen.getByRole("columnheader", { name: "Nama" })).toBeDefined();
		expect(screen.getByRole("columnheader", { name: "Akses" })).toBeDefined();
		expect(screen.getByRole("columnheader", { name: "Dibuat" })).toBeDefined();
		expect(
			screen.getByRole("columnheader", { name: "Terakhir dipakai" }),
		).toBeDefined();
		expect(screen.getByRole("columnheader", { name: "Status" })).toBeDefined();
	});

	it("never renders a full secret in the credential list", () => {
		render(<ApiKeysClient keys={[manualKey, automaticKey]} />);

		expect(screen.queryByText("vibe_a1b2c")).toBeNull();
		expect(screen.queryByText(/vibe_auto1,/)).toBeNull();
	});

	it("keeps a manual key without expiry out of the obsolete pile", () => {
		render(<ApiKeysClient keys={[manualKey]} />);

		expect(isObsoleteKey(manualKey)).toBe(false);
		expect(screen.queryByRole("button", { name: /bersihkan/i })).toBeNull();
	});

	it("flags an unbounded automatic handoff key as obsolete and offers cleanup", () => {
		render(<ApiKeysClient keys={[unboundedAutoKey]} />);

		expect(screen.getByText("Usang, tanpa batas waktu")).toBeDefined();
		expect(isObsoleteKey(unboundedAutoKey)).toBe(true);
		expect(
			screen.getByRole("button", { name: /bersihkan 1 akses usang/i }),
		).toBeDefined();
	});

	it("labels an expired credential with its expiry date and counts it for cleanup", () => {
		render(<ApiKeysClient keys={[expiredKey]} />);

		expect(screen.getByText(/Kedaluwarsa/)).toBeDefined();
		expect(isObsoleteKey(expiredKey)).toBe(true);
	});

	it("requires confirmation naming the credential before revoking it", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ success: true }));
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("location", { reload: vi.fn() });
		render(<ApiKeysClient keys={[manualKey, automaticKey]} />);

		fireEvent.click(
			screen.getByRole("button", { name: `Cabut akses ${manualKey.name}` }),
		);
		expect(screen.getByRole("heading", { name: "Cabut akses?" })).toBeDefined();
		expect(
			screen.getByText(
				`Akses "${manualKey.name}" akan langsung berhenti berfungsi.`,
				{
					exact: false,
				},
			),
		).toBeDefined();
		// Nothing is sent until the confirmation is accepted.
		expect(fetchMock).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Cabut akses" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			`/api/settings/api-keys/${manualKey.id}`,
		);
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
		// The list is re-read so the revoked row disappears.
		await waitFor(() => expect(invalidate).toHaveBeenCalled());
	});

	it("keeps credentials untouched when revocation is cancelled", () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		render(<ApiKeysClient keys={[manualKey]} />);

		fireEvent.click(
			screen.getByRole("button", { name: `Cabut akses ${manualKey.name}` }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByText(manualKey.name)).toBeDefined();
	});

	it("keeps manual creation in an accessible advanced disclosure", () => {
		render(<ApiKeysClient keys={[]} />);
		const toggle = advancedToggle();

		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(toggle.getAttribute("aria-controls")).toBe(
			"api-keys-advanced-panel",
		);

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(document.getElementById("api-keys-advanced-panel")).not.toBeNull();
		expect(manualCreateButton()).toBeDefined();

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(document.getElementById("api-keys-advanced-panel")).toBeNull();
	});

	it("opens the manual creation dialog from the advanced section", () => {
		render(<ApiKeysClient keys={[]} />);
		openAdvanced();
		fireEvent.click(manualCreateButton());

		expect(
			screen.getByRole("heading", { name: "Buat API Key Baru" }),
		).toBeDefined();
		expect(screen.getByLabelText("Nama")).toBeDefined();
		expect(screen.getByText("Scope")).toBeDefined();
	});

	it("shows the one-time secret once created, allows hiding, and drops it on close", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					Response.json({ id: "new-key", rawKey: "vibe_ui_fixture" }),
				),
		);
		render(<ApiKeysClient keys={[automaticKey]} />);
		openAdvanced();
		fireEvent.click(manualCreateButton());
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

		fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
		expect(screen.queryByText("vibe_ui_fixture")).toBeNull();
	});
});
