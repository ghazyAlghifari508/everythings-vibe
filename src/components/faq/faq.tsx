"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublicPageHeader, PublicPageShell } from "@/components/layout";
import { Icon } from "@/components/ui/icon";
import { FAQ_ITEMS, type FaqItem as FaqItemType } from "./faq-data";

function FaqRow({ item }: { item: FaqItemType }) {
	const [isOpen, setIsOpen] = useState(false);
	const panelId = `${item.id}-answer`;
	const triggerId = `${item.id}-trigger`;

	return (
		<div className="border-b border-graphite">
			<h2>
				<button
					type="button"
					id={triggerId}
					aria-controls={panelId}
					aria-expanded={isOpen}
					className="group flex min-h-[52px] w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-onyx sm:min-h-[56px] sm:py-5"
					onClick={() => setIsOpen((prev) => !prev)}
				>
					<span className="font-inter text-base font-[510] leading-snug text-snow transition-colors sm:text-[17px]">
						{item.title}
					</span>
					<span
						className={`shrink-0 text-fog transition-transform duration-200 ease-out motion-reduce:transition-none ${
							isOpen ? "rotate-180 text-snow" : ""
						}`}
					>
						<Icon
							icon={ArrowDown01Icon}
							size={16}
							aria-hidden="true"
							className="size-4"
						/>
					</span>
				</button>
			</h2>
			<section
				id={panelId}
				aria-labelledby={triggerId}
				aria-hidden={!isOpen}
				className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
					isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
				}`}
			>
				<div className="overflow-hidden">
					<p className="pb-5 pt-1 font-inter text-sm leading-relaxed text-fog sm:text-[15px] sm:leading-7">
						{item.content}
					</p>
				</div>
			</section>
		</div>
	);
}

export function Faq() {
	return (
		<PublicPageShell>
			<PublicPageHeader
				title="Pertanyaan yang Sering Diajukan"
				description="Informasi penting seputar penyimpanan project, credit, dan sinkronisasi di everythings-vibe."
			/>

			<div className="w-full max-w-3xl">
				<section
					aria-label="Daftar pertanyaan dan jawaban"
					className="w-full border-t border-graphite"
				>
					{FAQ_ITEMS.map((item) => (
						<FaqRow key={item.id} item={item} />
					))}
				</section>

				<footer className="mt-10 sm:mt-12">
					<p className="font-inter text-sm text-fog">
						Butuh bantuan lebih lanjut?{" "}
						<Link
							to="/bantuan"
							className="font-[510] text-snow underline underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-onyx"
						>
							Pusat Bantuan
						</Link>
						{" · "}
						<Link
							to="/settings/feedback"
							className="font-[510] text-snow underline underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-onyx"
						>
							Kirim Feedback
						</Link>
					</p>
				</footer>
			</div>
		</PublicPageShell>
	);
}
