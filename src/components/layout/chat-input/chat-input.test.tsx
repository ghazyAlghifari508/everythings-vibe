// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "../chat-input";

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateSpy,
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

const mockPlanState = vi.hoisted(() => ({
	data: {
		plan: "free",
		credits: 10,
		creditsUsed: 2,
		remaining: 8 as number | "unlimited",
		authenticated: true,
	},
	refetch: vi.fn(),
}));

vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({
		data: mockPlanState.data,
		refetch: mockPlanState.refetch,
	}),
}));

const mockSessionState = vi.hoisted(() => ({
	userId: "user-123",
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: mockSessionState.userId
				? { user: { id: mockSessionState.userId } }
				: null,
			isPending: false,
		}),
	},
}));

describe("ChatInput Component", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();
		mockSessionState.userId = "user-123";
		mockPlanState.data.remaining = 8;
		mockPlanState.refetch.mockResolvedValue({
			data: mockPlanState.data,
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("renders mode selector and toggles between greenfield and existing_codebase", () => {
		const onModeChange = vi.fn();
		render(<ChatInput onModeChange={onModeChange} />);

		const greenfieldBtn = screen.getByRole("button", { name: /produk baru/i });
		const codebaseBtn = screen.getByRole("button", {
			name: /codebase existing/i,
		});

		expect(greenfieldBtn.getAttribute("aria-pressed")).toBe("true");
		expect(codebaseBtn.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(codebaseBtn);
		expect(onModeChange).toHaveBeenCalledWith("existing_codebase");
		expect(codebaseBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("shows prompt error when message is shorter than MIN_PROMPT_LENGTH", async () => {
		render(<ChatInput />);

		const textarea = screen.getByRole("textbox");
		fireEvent.change(textarea, { target: { value: "Short" } });

		const sendBtn = screen.getByRole("button", {
			name: /kirim prompt ide produk/i,
		});
		await act(async () => {
			fireEvent.click(sendBtn);
		});

		expect(screen.getByText(/minimal \d+ karakter/i)).toBeDefined();
		expect(navigateSpy).not.toHaveBeenCalled();
	});

	it("submits on Enter key when prompt length is valid", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: "proj-abc", projectMode: "greenfield" }),
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ChatInput />);

		const textarea = screen.getByRole("textbox");
		const validPrompt =
			"Buat sebuah aplikasi manajemen tugas tim dengan fitur kanban board dan pelacakan waktu";
		fireEvent.change(textarea, { target: { value: validPrompt } });

		await act(async () => {
			fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/projects",
			expect.objectContaining({
				method: "POST",
			}),
		);
		expect(navigateSpy).toHaveBeenCalledWith({
			to: "/ask/$id",
			params: { id: "proj-abc" },
		});

		vi.unstubAllGlobals();
	});

	it("blocks creation and displays modal when credits are exhausted", async () => {
		mockPlanState.refetch.mockResolvedValue({
			data: {
				plan: "free",
				credits: 10,
				creditsUsed: 10,
				remaining: 0,
				authenticated: true,
			},
		});

		render(<ChatInput />);

		const textarea = screen.getByRole("textbox");
		const validPrompt =
			"Buat aplikasi baru untuk mengelola resep makanan sehat dan rencana belanja mingguan";
		fireEvent.change(textarea, { target: { value: validPrompt } });

		const sendBtn = screen.getByRole("button", {
			name: /kirim prompt ide produk/i,
		});
		await act(async () => {
			fireEvent.click(sendBtn);
		});

		expect(screen.getByText(/kredit kamu sudah habis/i)).toBeDefined();
		expect(navigateSpy).not.toHaveBeenCalled();
	});
});
