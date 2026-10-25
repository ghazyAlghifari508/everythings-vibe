import { useId } from "react";
import { cn } from "@/lib/utils";
import {
	type AdvancedParameterGroup,
	type AnyScrapeSettings,
	fromDisplayValue,
	type NumericParameterSpec,
	readNumber,
	readToggle,
	type ToggleParameterSpec,
	toDisplayValue,
} from "../types/parameter-spec";
import { ScrapeFilterSelect } from "./scrape-filter-select";

export const fieldClass =
	"min-h-11 w-full rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

export function ParameterGroup({
	group,
	settings,
	issues,
	onNumberChange,
	onToggleChange,
	onSelectChange,
}: {
	group: AdvancedParameterGroup;
	settings: AnyScrapeSettings;
	issues: Record<string, string>;
	onNumberChange: (key: NumericParameterSpec["key"], value: number) => void;
	onToggleChange: (key: ToggleParameterSpec["key"], value: boolean) => void;
	onSelectChange: (key: string, value: string) => void;
}) {
	const baseId = useId();
	return (
		<div className="min-w-0">
			<p className="text-xs font-semibold tracking-wide text-fog uppercase">
				{group.title}
			</p>
			<p className="mt-1 text-xs leading-5 text-fog">{group.description}</p>
			<div className="mt-4 grid gap-4 sm:grid-cols-2">
				{"viewport" in settings
					? group.selects?.map((spec) => (
							<div key={spec.key} className="min-w-0">
								<ScrapeFilterSelect
									label={spec.label}
									value={settings[spec.key]}
									options={spec.options}
									onChange={(value) => onSelectChange(spec.key, value)}
									className="w-full"
								/>
								<p className="mt-1.5 text-xs leading-5 text-fog">
									{spec.helper}
								</p>
							</div>
						))
					: null}
				{group.numbers.map((spec) => (
					<NumberField
						key={spec.key}
						spec={spec}
						value={readNumber(settings, spec.key)}
						issue={issues[spec.key]}
						onChange={(value) => onNumberChange(spec.key, value)}
						id={`${baseId}-${spec.key}`}
					/>
				))}
				{group.toggles.map((toggle) => (
					<label
						key={toggle.key}
						className="flex min-w-0 cursor-pointer items-start justify-between gap-3 rounded-lg border border-graphite p-3.5 transition-colors hover:border-fog/40 focus-within:ring-2 focus-within:ring-indigo sm:col-span-2"
					>
						<span className="min-w-0">
							<span className="block text-sm font-medium text-snow">
								{toggle.label}
							</span>
							<span className="mt-0.5 block text-xs leading-5 text-fog">
								{toggle.helper}
							</span>
						</span>
						<input
							type="checkbox"
							checked={readToggle(settings, toggle.key)}
							onChange={(event) =>
								onToggleChange(toggle.key, event.target.checked)
							}
							className="mt-0.5 size-4 shrink-0 accent-indigo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						/>
					</label>
				))}
			</div>
		</div>
	);
}

function NumberField({
	spec,
	value,
	issue,
	onChange,
	id,
}: {
	spec: NumericParameterSpec;
	value: number;
	issue?: string;
	onChange: (value: number) => void;
	id: string;
}) {
	const helperId = `${id}-helper`;
	const errorId = `${id}-error`;
	const displayValue = toDisplayValue(spec, value);
	return (
		<div className="min-w-0">
			<label
				htmlFor={id}
				className="flex items-baseline justify-between gap-2 text-sm font-medium text-snow"
			>
				{spec.label}
				<span className="shrink-0 font-mono text-xs text-fog">{spec.unit}</span>
			</label>
			<input
				id={id}
				type="number"
				inputMode="numeric"
				min={spec.min}
				max={spec.max}
				step={1}
				value={Number.isFinite(displayValue) ? displayValue : ""}
				onChange={(event) => {
					const val = event.target.valueAsNumber;
					if (Number.isNaN(val)) onChange(Number.NaN);
					else onChange(fromDisplayValue(spec, val));
				}}
				aria-invalid={issue ? true : undefined}
				aria-describedby={issue ? errorId : helperId}
				className={cn(
					fieldClass,
					"mt-1.5",
					issue && "border-crimson focus-visible:ring-crimson",
				)}
			/>
			{issue ? (
				<p id={errorId} role="alert" className="mt-1.5 text-xs text-crimson">
					{issue}
				</p>
			) : (
				<p id={helperId} className="mt-1.5 text-xs leading-5 text-fog">
					{spec.helper}
				</p>
			)}
		</div>
	);
}
