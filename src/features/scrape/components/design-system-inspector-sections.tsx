import type { DesignInspectorModel } from "@/lib/design-md-inspector";

export function SectionHeading({ children }: { children: string }) {
	return (
		<h3 className="text-base font-semibold tracking-tight text-snow">
			{children}
		</h3>
	);
}

export function InspectorSection({
	label,
	description,
	children,
	id,
}: {
	label: string;
	description?: string;
	children: React.ReactNode;
	id?: string;
}) {
	return (
		<section
			aria-label={label}
			id={id}
			className="scroll-mt-24 border-t border-graphite pt-6"
		>
			<SectionHeading>{label}</SectionHeading>
			{description ? (
				<p className="mt-1 text-xs leading-5 text-fog">{description}</p>
			) : null}
			<div className="mt-4">{children}</div>
		</section>
	);
}

export function themeLabel(
	theme: DesignInspectorModel["theme"],
): string | null {
	if (theme === "light") return "Terang";
	if (theme === "dark") return "Gelap";
	return null;
}
