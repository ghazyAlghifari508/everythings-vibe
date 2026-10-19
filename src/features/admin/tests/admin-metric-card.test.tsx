// @vitest-environment jsdom
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminMetricCard } from "../components/admin-metric-card";
import { StreamerModeProvider } from "../components/streamer-mode-context";

describe("AdminMetricCard", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("renders label, value, subtext, and icon correctly", () => {
		act(() => {
			root?.render(
				<StreamerModeProvider>
					<AdminMetricCard
						label="Total Pengguna"
						value={42}
						subtext="40 Aktif, 2 Pending"
						icon={UserGroupIcon}
					/>
				</StreamerModeProvider>,
			);
		});

		expect(container.textContent).toContain("Total Pengguna");
		expect(container.textContent).toContain("42");
		expect(container.textContent).toContain("40 Aktif, 2 Pending");
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders unmasked currency when streamer mode is off", () => {
		act(() => {
			root?.render(
				<StreamerModeProvider>
					<AdminMetricCard
						label="Pendapatan"
						value={299700}
						isCurrency={true}
						icon={UserGroupIcon}
					/>
				</StreamerModeProvider>,
			);
		});

		expect(container.textContent).toContain("Pendapatan");
		expect(container.textContent).toContain("299.700");
		expect(container.textContent).not.toContain("••••••••");
	});

	it("masks currency value when streamer mode is on", () => {
		localStorage.setItem("prdfy_admin_streamer_mode", "true");

		act(() => {
			root?.render(
				<StreamerModeProvider>
					<AdminMetricCard
						label="Pendapatan"
						value={299700}
						isCurrency={true}
						icon={UserGroupIcon}
					/>
				</StreamerModeProvider>,
			);
		});

		expect(container.textContent).toContain("Pendapatan");
		expect(container.textContent).toContain("••••••••");
	});

	it("supports custom function component icons for backward compatibility", () => {
		const MockLegacyIcon = ({ className }: { className?: string }) => (
			<span data-testid="mock-icon" className={className}>
				icon
			</span>
		);

		act(() => {
			root?.render(
				<StreamerModeProvider>
					<AdminMetricCard
						label="Custom Metric"
						value={99}
						icon={MockLegacyIcon}
					/>
				</StreamerModeProvider>,
			);
		});

		expect(container.textContent).toContain("Custom Metric");
		expect(container.querySelector('[data-testid="mock-icon"]')).not.toBeNull();
	});
});
