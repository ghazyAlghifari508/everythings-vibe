// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import { StudioLaunchComposer } from "@/features/studio/components/composer/studio-launch-composer";

const ESTIMATE = "Perkiraan 2 kredit";

describe("Studio credit estimate UX", () => {
	afterEach(() => cleanup());

	it("shows the server quote inline on the launch composer without a confirm dialog", () => {
		render(
			<StudioLaunchComposer
				prompt=""
				onPromptChange={vi.fn()}
				config={{ designMode: "web" }}
				onConfigChange={vi.fn()}
				reference={null}
				onOpenDesignPicker={vi.fn()}
				loading={false}
				error=""
				onSubmit={vi.fn()}
				textareaRef={{ current: null }}
				creditLabel={ESTIMATE}
			/>,
		);

		expect(screen.getByTestId("studio-credit-estimate").textContent).toContain(
			ESTIMATE,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("shows the server quote inline on the revision composer without a confirm dialog", () => {
		render(
			<StudioComposer
				onSubmit={vi.fn()}
				loading={false}
				selectedFrames={[{ id: "frame-1", name: "Dashboard" }]}
				creditLabel={ESTIMATE}
			/>,
		);

		expect(screen.getByTestId("studio-credit-estimate").textContent).toContain(
			ESTIMATE,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
