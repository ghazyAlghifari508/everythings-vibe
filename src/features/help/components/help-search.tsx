import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	type KeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { articleHref, getHelpCategory, HELP_ARTICLES } from "../data/articles";
import { searchHelpArticles } from "../lib/search";

const MAX_RESULTS = 6;

export function HelpSearch({ compact = false }: { compact?: boolean }) {
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const [isOpen, setIsOpen] = useState(false);
	const navigate = useNavigate();
	const listId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const trimmed = query.trim();
	const results = useMemo(
		() => searchHelpArticles(query, HELP_ARTICLES).slice(0, MAX_RESULTS),
		[query],
	);
	const showResults = isOpen && trimmed.length > 0;

	useEffect(() => {
		if (!isOpen) return;
		function handlePointerDown(event: PointerEvent) {
			if (
				event.target instanceof Node &&
				!rootRef.current?.contains(event.target)
			) {
				setIsOpen(false);
			}
		}

		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [isOpen]);

	function clear() {
		setQuery("");
		setActiveIndex(0);
		setIsOpen(false);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Escape") {
			if (query) clear();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			handleSubmit();
			return;
		}
		if (results.length === 0) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((index) => (index + 1) % results.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((index) => (index - 1 + results.length) % results.length);
		}
	}

	function handleSubmit() {
		const target = results[activeIndex];
		if (target) navigate({ href: articleHref(target.article) });
	}
	return (
		<div
			ref={rootRef}
			className={cn(
				"relative mx-auto w-full",
				compact ? "max-w-xl" : "max-w-2xl",
			)}
		>
			<search
				onSubmit={(event) => {
					event.preventDefault();
					handleSubmit();
				}}
			>
				<div className="relative">
					<Icon
						icon={Search01Icon}
						size={20}
						aria-hidden
						className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fog"
					/>
					<Input
						type="search"
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setActiveIndex(0);
							setIsOpen(true);
						}}
						onFocus={() => setIsOpen(true)}
						onKeyDown={handleKeyDown}
						placeholder="Cari panduan atau masalah..."
						aria-label="Cari panduan bantuan"
						role="combobox"
						aria-expanded={showResults}
						aria-controls={showResults ? listId : undefined}
						aria-autocomplete="list"
						aria-activedescendant={
							showResults && results.length > 0
								? `${listId}-${activeIndex}`
								: undefined
						}
						className="h-12 rounded-lg border border-graphite bg-charcoal/80 pl-11 pr-11 text-base"
					/>
					{query && (
						<button
							type="button"
							onClick={clear}
							aria-label="Hapus pencarian"
							className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<Icon icon={Cancel01Icon} size={18} aria-hidden />
						</button>
					)}
				</div>
			</search>

			{showResults && (
				<div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-xl border border-graphite bg-obsidian shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
					{results.length === 0 ? (
						<p className="px-4 py-5 text-sm leading-6 text-fog">
							Tidak ada panduan untuk "{trimmed}". Coba kata kunci lain,
							misalnya kredit atau revisi desain.
						</p>
					) : (
						<div
							id={listId}
							role="listbox"
							aria-label="Hasil pencarian bantuan"
						>
							{results.map(({ article }, index) => (
								<div
									key={article.id}
									id={`${listId}-${index}`}
									role="option"
									tabIndex={-1}
									aria-selected={index === activeIndex}
								>
									<Link
										to={articleHref(article)}
										onMouseEnter={() => setActiveIndex(index)}
										className={cn(
											"flex flex-col gap-1 border-b border-graphite/70 px-4 py-3 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo",
											index === activeIndex
												? "bg-white/5"
												: "hover:bg-white/[0.03]",
										)}
									>
										<span className="flex items-center justify-between gap-3">
											<span className="text-sm font-medium text-snow">
												{article.title}
											</span>
											<Badge variant="outline" className="shrink-0">
												{getHelpCategory(article.categoryId)?.label}
											</Badge>
										</span>
										<span className="text-xs leading-5 text-fog">
											{article.description}
										</span>
									</Link>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
