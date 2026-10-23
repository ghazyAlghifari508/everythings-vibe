// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";

afterEach(cleanup);
it("keeps a failed creation draft editable and clears it only after acceptance", async () => {
	let accepted = false;
	const submit = vi.fn(async () => accepted);
	render(
		<CodebaseChatWorkspace
			featureName="Repository"
			messages={[]}
			questions={[]}
			answers={{}}
			onSendMessage={submit}
		/>,
	);
	const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
	fireEvent.change(composer, {
		target: { value: "Independent feature request" },
	});
	await act(async () => {
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
	});
	expect(submit).toHaveBeenCalledOnce();
	expect(composer.value).toBe("Independent feature request");
	accepted = true;
	await act(async () => {
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
	});
	expect(composer.value).toBe("");
});
