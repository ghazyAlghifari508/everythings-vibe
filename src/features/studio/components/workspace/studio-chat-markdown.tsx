import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const heading = ({ children }: { children?: React.ReactNode }) => (
	<h3 className="mt-4 text-sm font-semibold text-snow first:mt-0">
		{children}
	</h3>
);

/** react-markdown never renders raw HTML, and its URL transform drops javascript: and data: links. */
const components: Components = {
	a: ({ href, children }) =>
		href ? (
			<a
				href={href}
				target="_blank"
				rel="noreferrer noopener"
				className="text-snow underline underline-offset-2 hover:text-fog focus-visible:outline-2 focus-visible:outline-snow"
			>
				{children}
			</a>
		) : (
			<span>{children}</span>
		),
	// Separators and quote blocks are noise in a narrow chat column.
	hr: () => null,
	blockquote: ({ children }) => (
		<div className="mt-2 text-sm leading-relaxed text-fog">{children}</div>
	),
	em: ({ children }) => <em className="italic">{children}</em>,
	h1: heading,
	h2: heading,
	h3: heading,
	h4: heading,
	p: ({ children }) => (
		<p className="mt-2 text-sm leading-relaxed text-snow first:mt-0">
			{children}
		</p>
	),
	ul: ({ children }) => (
		<ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-snow marker:text-fog">
			{children}
		</ul>
	),
	ol: ({ children }) => (
		<ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-snow marker:text-fog">
			{children}
		</ol>
	),
	strong: ({ children }) => (
		<strong className="font-semibold text-snow">{children}</strong>
	),
	code: ({ children }) => (
		<code className="rounded bg-steel px-1 py-0.5 font-mono text-[0.8125rem] text-snow">
			{children}
		</code>
	),
	pre: ({ children }) => (
		<pre className="mt-2 overflow-x-auto rounded-lg bg-charcoal p-3 text-xs">
			{children}
		</pre>
	),
	table: ({ children }) => (
		<div className="mt-2 overflow-x-auto">
			<table className="w-full text-left text-xs text-snow">{children}</table>
		</div>
	),
	li: ({ children }) => <li className="min-w-0">{children}</li>,
	th: ({ children }) => (
		<th className="border-b border-iron px-2 py-1 font-semibold">{children}</th>
	),
	td: ({ children }) => (
		<td className="border-b border-iron/50 px-2 py-1">{children}</td>
	),
};

export function StudioChatMarkdown({ content }: { content: string }) {
	return (
		<div className="min-w-0 break-words [overflow-wrap:anywhere]">
			<Markdown
				remarkPlugins={[remarkGfm]}
				components={components}
				skipHtml
				disallowedElements={["img"]}
			>
				{content}
			</Markdown>
		</div>
	);
}
