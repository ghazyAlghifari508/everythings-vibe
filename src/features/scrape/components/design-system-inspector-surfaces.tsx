import type { DesignInspectorModel } from "@/features/scrape/utils/design-md-inspector";

export function SurfaceList({
	surfaces,
}: {
	surfaces: DesignInspectorModel["surfaces"];
}) {
	return (
		<div className="flex flex-col gap-2">
			{surfaces.map((surface) => (
				<div
					key={`${surface.level}-${surface.value}`}
					className="flex items-center gap-3 rounded-lg border border-graphite p-3"
				>
					<div
						role="img"
						aria-label={`Contoh surface level ${surface.level} ${surface.value}`}
						className="size-8 shrink-0 rounded-md border border-graphite"
						style={{ backgroundColor: surface.value }}
					/>
					<div className="min-w-0">
						<p
							className="font-mono text-xs break-all text-snow"
							style={{ overflowWrap: "anywhere" }}
						>
							{surface.value}
						</p>
						<p className="break-words text-[11px] text-fog">
							Level {surface.level} · {surface.frequency} elemen
							{surface.roles.length > 0 ? ` · ${surface.roles.join(", ")}` : ""}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}

export function ElevationList({
	tokens,
}: {
	tokens: DesignInspectorModel["elevation"];
}) {
	return (
		<div className="flex flex-col gap-3">
			{tokens.map((token) => (
				<div
					key={token.value}
					className="min-w-0 rounded-lg border border-graphite p-3"
				>
					<div
						role="img"
						aria-label={`Contoh elevation ${token.value}`}
						className="mb-2 h-12 rounded-md border border-graphite bg-onyx"
						style={{ boxShadow: token.value }}
					/>
					<p className="break-all font-mono text-[11px] text-mist">
						{token.value}
					</p>
					<p className="mt-1 text-[11px] leading-4 text-fog">
						{token.frequency > 0 ? `${token.frequency} elemen` : null}
						{token.roles.length > 0 ? ` · ${token.roles.join(", ")}` : null}
						{token.usageNote ? ` · ${token.usageNote}` : null}
					</p>
				</div>
			))}
		</div>
	);
}

function CharacteristicRows({
	entries,
}: {
	entries: DesignInspectorModel["components"][number]["sharedCharacteristics"];
}) {
	return (
		<dl className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[8rem_1fr]">
			{entries.map((entry) => (
				<div key={`${entry.label}-${entry.value}`} className="contents">
					<dt className="text-[11px] text-fog">{entry.label}</dt>
					<dd className="break-words font-mono text-[11px] text-mist">
						{entry.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

export function ComponentPatternList({
	components,
}: {
	components: DesignInspectorModel["components"];
}) {
	return (
		<ul className="flex flex-col gap-3">
			{components.map((component) => (
				<li
					key={component.name}
					className="min-w-0 rounded-lg border border-graphite p-3"
				>
					<p className="text-sm font-semibold text-snow">{component.name}</p>
					{component.purpose ? (
						<p className="mt-1 text-xs leading-5 text-mist">
							{component.purpose}
						</p>
					) : null}
					{component.sharedCharacteristics.length > 0 ? (
						<CharacteristicRows entries={component.sharedCharacteristics} />
					) : null}
					{component.variants.length > 1 ? (
						<div className="mt-2 flex flex-col gap-2">
							{component.variants.map((variant) => (
								<div key={variant.label}>
									<p className="text-[11px] font-medium text-snow">
										{variant.label} · {variant.samples} elemen
									</p>
									{variant.characteristics.length > 0 ? (
										<CharacteristicRows entries={variant.characteristics} />
									) : (
										<p className="mt-1 text-[11px] text-fog">
											Sama dengan karakteristik bersama di atas.
										</p>
									)}
								</div>
							))}
						</div>
					) : null}
					{component.description ? (
						<p className="mt-2 text-[11px] leading-4 text-fog">
							{component.description}
						</p>
					) : null}
					{component.evidence ? (
						<p className="mt-1 text-[11px] leading-4 text-fog">
							Bukti: {component.evidence}
						</p>
					) : null}
					{component.guidance.length > 0 ? (
						<ul className="mt-2 flex flex-col gap-1">
							{component.guidance.map((rule) => (
								<li key={rule} className="text-[11px] leading-4 text-mist">
									• {rule}
								</li>
							))}
						</ul>
					) : null}
				</li>
			))}
		</ul>
	);
}
