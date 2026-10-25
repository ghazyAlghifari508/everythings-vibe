// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioLandingPage } from "../components/workspace/studio-landing-page";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

describe("StudioLandingPage Layout Geometry", () => {
	const mockHistory = [
		{
			id: "proj-1",
			title: "Analytics Dashboard",
			designMode: "web" as const,
			hasDesignMd: false,
			hasLogo: false,
			createdAt: "2026-03-01T00:00:00Z",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("uses consistent viewport-anchored gutters and avoids restrictive 1440px centered containers", () => {
		const { container } = render(
			<StudioLandingPage
				history={mockHistory}
				scrapeSources={[]}
				search={{}}
			/>,
		);

		const header = container.querySelector("header");
		expect(header).not.toBeNull();
		expect(header?.className).toContain("w-full");
		expect(header?.className).toContain("px-4");
		expect(header?.className).toContain("sm:px-6");
		expect(header?.className).toContain("lg:px-8");
		expect(header?.className).not.toContain("max-w-[1440px]");
		expect(header?.className).not.toContain("mx-auto");

		const bodyContainer = header?.nextElementSibling;
		expect(bodyContainer).not.toBeNull();
		expect(bodyContainer?.className).toContain("w-full");
		expect(bodyContainer?.className).toContain("px-4");
		expect(bodyContainer?.className).toContain("sm:px-6");
		expect(bodyContainer?.className).toContain("lg:px-8");
		expect(bodyContainer?.className).not.toContain("max-w-[1440px]");
		expect(bodyContainer?.className).not.toContain("mx-auto");
	});

	it("allocates flexible horizontal space to the main composer while preserving text bounds", () => {
		const { container } = render(
			<StudioLandingPage
				history={mockHistory}
				scrapeSources={[]}
				search={{}}
			/>,
		);

		const main = container.querySelector("main");
		expect(main).not.toBeNull();
		expect(main?.className).toContain("flex-1");
		expect(main?.className).toContain("min-w-0");

		const contentWrapper = main?.firstElementChild;
		expect(contentWrapper).not.toBeNull();
		expect(contentWrapper?.className).toContain("max-w-5xl");
		expect(contentWrapper?.className).toContain("lg:max-w-6xl");
		expect(contentWrapper?.className).toContain("xl:max-w-7xl");
		expect(contentWrapper?.className).not.toContain("max-w-3xl");
		expect(contentWrapper?.className).not.toContain("lg:max-w-4xl");

		// Subtitle retains bounded line-length
		const subtitle = screen.getByText(/Ubah idemu menjadi rancangan aplikasi/i);
		expect(subtitle.className).toContain("max-w-2xl");
	});

	it("preserves floating sidebar geometry with stable height and responsive width", () => {
		const { container } = render(
			<StudioLandingPage
				history={mockHistory}
				scrapeSources={[]}
				search={{}}
			/>,
		);

		const sidebar = container.querySelector("aside");
		expect(sidebar).not.toBeNull();
		expect(sidebar?.className).toContain("w-72");
		expect(sidebar?.className).toContain("lg:w-80");
		expect(sidebar?.className).toContain("rounded-2xl");
		expect(sidebar?.className).toContain("border");
	});

	it("maintains stable sidebar geometry when history is empty without layout jumps", () => {
		const { container } = render(
			<StudioLandingPage history={[]} scrapeSources={[]} search={{}} />,
		);

		const sidebar = container.querySelector("aside");
		expect(sidebar).not.toBeNull();
		expect(sidebar?.className).toContain("w-72");
		expect(sidebar?.className).toContain("lg:w-80");
		expect(screen.getByText("Belum ada project studio.")).toBeDefined();
	});
});
