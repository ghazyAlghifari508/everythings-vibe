import { useEffect, useRef } from "react";
import {
	type StudioPrototypeDocument,
	type StudioPrototypeMessage,
	type StudioPrototypeState,
	studioPrototypeInitSchema,
} from "@/features/studio/types/studio-prototype";
import { acceptStudioPrototypeMessage } from "@/features/studio/utils/studio-prototype-bridge";

interface StudioPrototypeFrameProps {
	document: StudioPrototypeDocument;
	title: string;
	state: StudioPrototypeState;
	onMessage: (message: StudioPrototypeMessage) => void;
}

/**
 * Renders one isolated prototype document. `sandbox="allow-scripts"` only: no
 * same-origin, forms, popups, top navigation or downloads, so the document can
 * neither reach EvVibe credentials nor navigate the parent. The only data that
 * crosses the boundary is validated: one `proto:init` state object in, and
 * schema-checked, channel-scoped messages out.
 */
export function StudioPrototypeFrame({
	document: prototype,
	title,
	state,
	onMessage,
}: StudioPrototypeFrameProps) {
	const frame = useRef<HTMLIFrameElement>(null);
	const latest = useRef({ state, onMessage });
	latest.current = { state, onMessage };

	useEffect(() => {
		function receive(event: MessageEvent<unknown>) {
			const message = acceptStudioPrototypeMessage(event, {
				channel: prototype.channel,
				screenId: prototype.frameId,
				source: frame.current?.contentWindow,
			});
			if (message) latest.current.onMessage(message);
		}
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [prototype.channel, prototype.frameId]);

	function sendInit() {
		const init = studioPrototypeInitSchema.safeParse({
			type: "proto:init",
			channel: prototype.channel,
			state: { ...prototype.defaults, ...latest.current.state },
		});
		// A sandboxed document has an opaque origin: "*" is the only target, and
		// the payload is bounded mock state with nothing secret in it.
		if (init.success) frame.current?.contentWindow?.postMessage(init.data, "*");
	}

	return (
		<iframe
			ref={frame}
			key={prototype.channel}
			title={title}
			sandbox="allow-scripts"
			referrerPolicy="no-referrer"
			srcDoc={prototype.html}
			onLoad={sendInit}
			className="block size-full border-0 bg-white"
		/>
	);
}
