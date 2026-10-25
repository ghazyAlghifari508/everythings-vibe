// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { useUIStore } from "@/store";

const mockUseUserPlan = vi.fn();
vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => mockUseUserPlan(),
}));

interface LocationStub {
	href: string;
	pathname: string;
	search: string;
	hash: string;
}

function stubLocation(overrides: Partial<LocationStub> = {}): LocationStub {
	const stub: LocationStub = {
		href: "",
		pathname: "/",
		search: "",
		hash: "",
		...overrides,
	};
	vi.stubGlobal("location", stub);
	return stub;
}

function renderModal(
	props: Partial<Parameters<typeof CreditExhaustedModal>[0]> = {},
) {
	return render(
		<CreditExhaustedModal
			isOpen={true}
			onClose={vi.fn()}
			errorMessage="Saldo kredit Anda telah habis."
			projectId="proj-123"
			stage="prd"
			{...props}
		/>,
	);
}

function paidEligiblePlan() {
	return {
		data: {
			plan: "pro",
			topUpEligible: true,
			credits: 30,
			remaining: 0,
			currentPeriodEnd: "2026-10-01T00:00:00.000Z",
		},
	};
}

function isPackageChecked(name: RegExp): boolean {
	return (screen.getByRole("radio", { name }) as HTMLInputElement).checked;
}

beforeEach(() => {
	mockUseUserPlan.mockReturnValue({
		data: { plan: "free", topUpEligible: false },
	});
	vi.restoreAllMocks();
	sessionStorage.clear();
	useUIStore.getState().hideToast();
	stubLocation();
	global.fetch = vi
		.fn()
		.mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("CreditExhaustedModal", () => {
	it("renders dialog with role, aria-modal, and aria-labelledby", () => {
		const { container } = renderModal();

		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog).toBeDefined();
		expect(dialog?.getAttribute("aria-modal")).toBe("true");
		expect(dialog?.getAttribute("aria-labelledby")).toBe(
			"credit-exhausted-modal-title",
		);

		const title = container.querySelector("#credit-exhausted-modal-title");
		expect(title?.textContent).toBe("Kredit Habis");
	});

	it("does not render dialog content when closed", () => {
		renderModal({ isOpen: false });
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it("dismisses on Escape key", () => {
		const onClose = vi.fn();
		renderModal({ onClose });

		document.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(onClose).toHaveBeenCalled();
	});

	it("closes via the close button and the overlay", () => {
		const onClose = vi.fn();
		renderModal({ onClose });

		fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
		fireEvent.click(screen.getByRole("button", { name: "Tutup modal" }));
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it("moves focus into the dialog on open", () => {
		renderModal();
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.contains(document.activeElement)).toBe(true);
	});

	it("renders subscription view directly for free plan users", () => {
		renderModal({ currentPlan: "free" });
		expect(screen.getByText("Berlangganan Pro")).toBeDefined();
	});

	it("renders topup view first for paid subscribers and allows switching to subscription view", () => {
		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });
		expect(screen.getByText("Isi Ulang Kredit Instan")).toBeDefined();

		fireEvent.click(screen.getByText(/Lihat Paket Langganan/i));
		expect(screen.getByText("Berlangganan Pro")).toBeDefined();

		fireEvent.click(screen.getByText(/Kembali ke Pilihan Top Up/i));
		expect(screen.getByText("Isi Ulang Kredit Instan")).toBeDefined();
	});

	it("defaults to subscription view when a paid user is not top-up eligible", () => {
		mockUseUserPlan.mockReturnValue({
			data: { plan: "pro", topUpEligible: false, credits: 30, remaining: 0 },
		});
		renderModal({ currentPlan: "pro" });
		expect(screen.getByText("Berlangganan Pro")).toBeDefined();
		expect(screen.queryByText("Isi Ulang Kredit Instan")).toBeNull();
	});

	it("renders subscription view when title includes 'Pro' (paywall mode) even for paid subscribers", () => {
		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({
			stage: "ac",
			currentPlan: "pro",
			title: "Lanjut ke AC butuh Pro",
		});
		expect(screen.getByText("Lanjut ke AC butuh Pro")).toBeDefined();
		expect(screen.getByText("Berlangganan Pro")).toBeDefined();
	});

	it("resets to the default view when the modal reopens", () => {
		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		const { rerender } = render(
			<CreditExhaustedModal
				isOpen={true}
				onClose={vi.fn()}
				errorMessage="Kredit habis"
				projectId="proj-123"
				stage="prd"
				currentPlan="pro"
			/>,
		);
		fireEvent.click(screen.getByText(/Lihat Paket Langganan/i));
		expect(screen.getByText("Berlangganan Pro")).toBeDefined();

		rerender(
			<CreditExhaustedModal
				isOpen={false}
				onClose={vi.fn()}
				errorMessage="Kredit habis"
				projectId="proj-123"
				stage="prd"
				currentPlan="pro"
			/>,
		);
		rerender(
			<CreditExhaustedModal
				isOpen={true}
				onClose={vi.fn()}
				errorMessage="Kredit habis"
				projectId="proj-123"
				stage="prd"
				currentPlan="pro"
			/>,
		);
		expect(screen.getByText("Isi Ulang Kredit Instan")).toBeDefined();
	});

	it("defaults to the first package and exposes radio-group semantics", () => {
		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		const group = screen.getByRole("radiogroup", {
			name: "Pilihan Paket",
		});
		expect(group).toBeDefined();

		const packages = screen.getAllByRole("radio");
		expect(packages).toHaveLength(3);
		expect(isPackageChecked(/Paket 15 Kredit/i)).toBe(true);
		expect(isPackageChecked(/Paket 40 Kredit/i)).toBe(false);
	});

	it("changes the selected package when another option is chosen", () => {
		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		fireEvent.click(screen.getByRole("radio", { name: /Paket 40 Kredit/i }));

		expect(isPackageChecked(/Paket 40 Kredit/i)).toBe(true);
		expect(isPackageChecked(/Paket 15 Kredit/i)).toBe(false);
		expect(
			screen.getByRole("button", { name: /Beli 40 Kredit/i }),
		).toBeDefined();
	});

	it("submits the selected package with resume context to the payments API", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/mock",
			}),
		});
		global.fetch = fetchMock;

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro", projectId: "p1" });

		fireEvent.click(screen.getByText(/Paket 40 Kredit/));
		fireEvent.click(screen.getByRole("button", { name: /Beli 40 Kredit/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/payments/create",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						planId: "topup-40",
						returnUrl: "/",
						projectId: "p1",
					}),
				}),
			);
		});
	});

	it("persists resume intent before creating the checkout request", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, json: async () => ({}) });
		global.fetch = fetchMock;

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro", projectId: "proj-resume", stage: "ac" });

		fireEvent.click(screen.getByRole("button", { name: /Beli 15 Kredit/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const raw = sessionStorage.getItem("prdfy:resume-intent");
		expect(raw).toBeTruthy();
		expect(JSON.parse(raw ?? "null")).toMatchObject({
			projectId: "proj-resume",
			stage: "ac",
		});
	});

	it("redirects to the returned checkout url on success", async () => {
		const location = stubLocation({ pathname: "/prd/proj-123" });
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/mock",
			}),
		});

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		fireEvent.click(screen.getByRole("button", { name: /Beli 15 Kredit/i }));

		await waitFor(() =>
			expect(location.href).toBe(
				"https://app.sandbox.midtrans.com/snap/v2/vtweb/mock",
			),
		);
	});

	it("redirects to login with the return url on HTTP 401", async () => {
		const location = stubLocation({
			pathname: "/prd/proj-123",
			search: "?tab=chat",
		});
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ error: "unauthorized" }),
		});

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		fireEvent.click(screen.getByRole("button", { name: /Beli 15 Kredit/i }));

		await waitFor(() =>
			expect(location.href).toBe(
				`/login?redirect=${encodeURIComponent("/prd/proj-123?tab=chat")}`,
			),
		);
	});

	it("reports the server error via toast on API failure", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: "Kuota top-up periode ini sudah habis." }),
		});

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		fireEvent.click(screen.getByRole("button", { name: /Beli 15 Kredit/i }));

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Kuota top-up periode ini sudah habis.",
			);
			expect(useUIStore.getState().toastType).toBe("error");
		});
	});

	it("falls back to a generic message when the API omits an error", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({}),
		});

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		fireEvent.click(screen.getByRole("button", { name: /Beli 15 Kredit/i }));

		await waitFor(() =>
			expect(useUIStore.getState().toastMessage).toBe(
				"Gagal memproses pembayaran.",
			),
		);
	});

	it("reports network failure and resets the loading state", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("offline"));

		mockUseUserPlan.mockReturnValue(paidEligiblePlan());
		renderModal({ currentPlan: "pro" });

		const buyButton = screen.getByRole("button", { name: /Beli 15 Kredit/i });
		fireEvent.click(buyButton);

		await waitFor(() =>
			expect(useUIStore.getState().toastMessage).toBe(
				"Gagal menghubungi server.",
			),
		);
		await waitFor(() =>
			expect((buyButton as HTMLButtonElement).disabled).toBe(false),
		);
		expect(screen.queryByText("Memproses Pembayaran...")).toBeNull();
	});

	it("prevents duplicate payment submissions", async () => {
		const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
		global.fetch = fetchMock;

		renderModal({ currentPlan: "free" });
		const proButton = screen.getByRole("button", { name: "Pilih paket Pro" });

		fireEvent.click(proButton);
		fireEvent.click(proButton);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
	});

	it("does not submit the disabled free plan", async () => {
		const fetchMock = vi.fn();
		global.fetch = fetchMock;

		renderModal({ currentPlan: "free" });
		const freeButton = screen.getByRole("button", { name: "Pilih paket Free" });

		expect((freeButton as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(freeButton);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
