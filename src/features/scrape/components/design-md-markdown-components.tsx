import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

export const markdownComponents: Components = {
	a: ({ children, ...props }) => (
		<a
			{...props}
			target="_blank"
			rel="noreferrer noopener"
			className="text-indigo underline underline-offset-2"
		>
			{children}
		</a>
	),
	h1: ({ children, ...props }) => (
		<h1 {...props} className="mt-2 text-xl font-bold tracking-tight text-snow">
			{children}
		</h1>
	),
	h2: ({ children, ...props }) => (
		<h2
			{...props}
			className="mt-6 border-b border-graphite pb-2 text-lg font-bold tracking-tight text-snow"
		>
			{children}
		</h2>
	),
	h3: ({ children, ...props }) => (
		<h3 {...props} className="mt-5 text-base font-semibold text-snow">
			{children}
		</h3>
	),
	h4: ({ children, ...props }) => (
		<h4 {...props} className="mt-4 text-sm font-semibold text-mist">
			{children}
		</h4>
	),
	p: ({ children, ...props }) => (
		<p {...props} className="mt-2 text-sm leading-6 text-mist">
			{children}
		</p>
	),
	ul: ({ children, ...props }) => (
		<ul {...props} className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist">
			{children}
		</ul>
	),
	ol: ({ children, ...props }) => (
		<ol
			{...props}
			className="mt-2 list-decimal space-y-1 pl-5 text-sm text-mist"
		>
			{children}
		</ol>
	),
	li: ({ children, ...props }) => (
		<li {...props} className="leading-6">
			{children}
		</li>
	),
	table: ({ children, ...props }) => (
		<div className="mt-3 overflow-x-auto rounded-lg border border-graphite">
			<table {...props} className="w-full min-w-[480px] text-xs">
				{children}
			</table>
		</div>
	),
	thead: ({ children, ...props }) => (
		<thead {...props} className="bg-onyx text-slate">
			{children}
		</thead>
	),
	th: ({ children, ...props }) => (
		<th
			{...props}
			className="border-b border-graphite px-3 py-2 text-left font-mono font-semibold"
		>
			{children}
		</th>
	),
	td: ({ children, ...props }) => (
		<td
			{...props}
			className="border-b border-graphite px-3 py-2 align-top font-mono text-mist last:border-b-0"
		>
			{children}
		</td>
	),
	code: ({ className, children, ...props }) => (
		<code
			{...props}
			className={cn(
				"rounded bg-onyx px-1 py-0.5 font-mono text-[11px] text-mist",
				className,
			)}
		>
			{children}
		</code>
	),
	pre: ({ children, ...props }) => (
		<pre
			{...props}
			className="mt-3 overflow-x-auto rounded-lg border border-graphite bg-onyx p-3 font-mono text-xs leading-5 text-mist"
		>
			{children}
		</pre>
	),
	blockquote: ({ children, ...props }) => (
		<blockquote
			{...props}
			className="mt-3 border-l-2 border-graphite pl-3 text-sm text-fog italic"
		>
			{children}
		</blockquote>
	),
};
