"use client";
import { computeDiff } from "@/lib/diff-utils";
export function PrdDiffViewer({
	oldContent,
	newContent,
}: {
	oldContent: string;
	newContent: string;
}) {
	if (!oldContent || !newContent)
		return (
			<div className="p-4 text-sm text-fog">
				Pilih versi lama untuk dibandingkan dengan versi saat ini.
			</div>
		);
	if (oldContent === newContent)
		return <div className="p-4 text-sm text-fog">Tidak ada perubahan.</div>;
	const diff = computeDiff(oldContent, newContent);
	return (
		<div className="font-mono text-xs overflow-auto">
			{diff.map((l, idx) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional; identical context lines repeat
					key={idx}
					className={
						l.type === "added"
							? "bg-emerald/15 text-emerald"
							: l.type === "removed"
								? "bg-crimson/15 text-crimson line-through"
								: "text-fog"
					}
				>
					{l.type === "added" ? "+ " : l.type === "removed" ? "- " : "  "}
					{l.text}
				</div>
			))}
		</div>
	);
}
