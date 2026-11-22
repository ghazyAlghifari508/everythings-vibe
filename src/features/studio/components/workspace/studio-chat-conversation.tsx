import { Disclosure, ScrollShadow } from "@heroui/react";
import {
	AlertCircleIcon,
	ArrowDown01Icon,
	ArrowUp01Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { type MutableRefObject, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { StudioMessageRow } from "@/db/schema";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { cn } from "@/lib/utils";
import {
	describeStudioResult,
	isLongStudioUserMessage,
} from "../../utils/studio-chat-message";
import { StudioChatMarkdown } from "./studio-chat-markdown";

/** Scroll position lives above the conversation so a remounted drawer reopens where it was. */
export type StudioChatScrollMemory = MutableRefObject<{
	top: number;
	following: boolean;
}>;

interface ConversationProps {
	messages: StudioMessageRow[];
	expandedIds: ReadonlySet<string>;
	onToggleExpanded: (id: string) => void;
	scrollMemory: StudioChatScrollMemory;
}

function Attachments({ message }: { message: StudioMessageRow }) {
	if (!message.attachments.length) return null;
	return (
		<ul
			aria-label="Layar terkait"
			className="flex flex-wrap justify-end gap-1.5"
		>
			{message.attachments.map((attachment) => (
				<li
					key={attachment.frameId}
					className="max-w-full truncate rounded-md border border-iron px-2 py-1 text-xs text-fog"
					title={attachment.name}
				>
					{attachment.name}
				</li>
			))}
		</ul>
	);
}

function UserBubble({
	message,
	expanded,
	onToggle,
}: {
	message: StudioMessageRow;
	expanded: boolean;
	onToggle: () => void;
}) {
	const long = isLongStudioUserMessage(message.content);
	const bodyId = `studio-message-${message.id}`;
	return (
		<article
			aria-label="Pesan Anda"
			className="flex min-w-0 flex-col items-end gap-1.5"
		>
			<div className="max-w-[88%] min-w-0 rounded-xl rounded-br-sm bg-steel px-3.5 py-2.5 text-sm leading-relaxed text-snow">
				<p
					id={bodyId}
					className={cn(
						"whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
						long && !expanded && "line-clamp-4",
					)}
				>
					{message.content}
				</p>
				{long ? (
					<button
						type="button"
						aria-expanded={expanded}
						aria-controls={bodyId}
						aria-label={expanded ? "Ciutkan pesan" : "Tampilkan seluruh pesan"}
						onClick={onToggle}
						className="-mr-2.5 -mb-2.5 ml-auto flex size-11 items-center justify-center rounded-lg text-fog hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
					>
						<Icon icon={expanded ? ArrowUp01Icon : ArrowDown01Icon} size={16} />
					</button>
				) : null}
			</div>
			<Attachments message={message} />
		</article>
	);
}

function ResultCard({ message }: { message: StudioMessageRow }) {
	const progress = message.progress;
	const result = progress ? describeStudioResult(progress) : null;
	if (!progress || !result) return null;
	const failed = new Set(progress.failedScreens ?? []);
	const lead = result.running ? (
		<Spinner size={12} />
	) : (
		<Icon
			icon={progress.phase === "completed" ? Tick02Icon : AlertCircleIcon}
			size={14}
			className="shrink-0 text-fog"
		/>
	);
	const label = (
		<span className="flex min-w-0 items-center gap-2">
			{lead}
			<span className="truncate">{result.label}</span>
		</span>
	);
	const card =
		"mt-3 rounded-xl border border-iron/70 bg-charcoal/60 text-sm text-snow";
	if (!progress.screenNames.length)
		return (
			<div className={cn(card, "flex min-h-11 items-center px-3")}>{label}</div>
		);
	return (
		<Disclosure className={card}>
			<Disclosure.Heading>
				<Disclosure.Trigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left focus-visible:outline-2 focus-visible:outline-snow">
					{label}
					<span className="flex shrink-0 items-center gap-1 text-xs text-fog">
						Lihat
						<Disclosure.Indicator />
					</span>
				</Disclosure.Trigger>
			</Disclosure.Heading>
			<Disclosure.Content>
				<Disclosure.Body>
					<ul className="space-y-1 px-3 pb-3 text-xs text-fog">
						{progress.screenNames.map((name) => (
							<li
								key={name}
								className="flex items-baseline justify-between gap-2"
							>
								<span className="min-w-0 truncate text-snow">{name}</span>
								{failed.has(name) ? (
									<span className="shrink-0">Belum berhasil</span>
								) : null}
							</li>
						))}
					</ul>
				</Disclosure.Body>
			</Disclosure.Content>
		</Disclosure>
	);
}

function AssistantMessage({ message }: { message: StudioMessageRow }) {
	const progress = message.progress;
	const hasResult = Boolean(progress && describeStudioResult(progress));
	const working =
		message.status === "queued" ||
		message.status === "planning" ||
		message.status === "generating";
	return (
		<article aria-label="Balasan design agent" className="min-w-0">
			<StudioChatMarkdown content={message.content} />
			<ResultCard message={message} />
			{working && !hasResult ? (
				<div className="mt-2 text-fog">
					<Spinner size={14} label="Sedang diproses" />
				</div>
			) : null}
		</article>
	);
}

export function StudioChatConversation({
	messages,
	expandedIds,
	onToggleExpanded,
	scrollMemory,
}: ConversationProps) {
	const viewport = useRef<HTMLDivElement>(null);
	useIsomorphicLayoutEffect(() => {
		const element = viewport.current;
		if (element && !scrollMemory.current.following)
			element.scrollTop = scrollMemory.current.top;
	}, [scrollMemory]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new message list is the signal to follow the tail
	useEffect(() => {
		if (scrollMemory.current.following && viewport.current)
			viewport.current.scrollTop = viewport.current.scrollHeight;
	}, [messages, scrollMemory]);
	return (
		<ScrollShadow
			ref={viewport}
			role="log"
			aria-label="Percakapan desain"
			aria-live="polite"
			aria-relevant="additions text"
			tabIndex={0}
			className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-snow"
			onScroll={(event) => {
				const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
				scrollMemory.current = {
					top: scrollTop,
					following: scrollHeight - scrollTop - clientHeight < 48,
				};
			}}
		>
			{messages.length === 0 ? (
				<p className="text-sm leading-relaxed text-fog">
					Percakapan desain akan tersimpan di project ini. Pilih layar untuk
					revisi atau minta halaman baru.
				</p>
			) : (
				<div className="flex flex-col gap-5">
					{messages.map((message) =>
						message.role === "user" ? (
							<UserBubble
								key={message.id}
								message={message}
								expanded={expandedIds.has(message.id)}
								onToggle={() => onToggleExpanded(message.id)}
							/>
						) : (
							<AssistantMessage key={message.id} message={message} />
						),
					)}
				</div>
			)}
		</ScrollShadow>
	);
}
