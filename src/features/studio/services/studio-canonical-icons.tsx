import {
	Add01Icon,
	Airplane01Icon,
	Analytics01Icon,
	Calendar01Icon,
	ChartHistogramIcon,
	Home01Icon,
	Location01Icon,
	Menu01Icon,
	Search01Icon,
	Settings01Icon,
	UserIcon,
	Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon } from "@/components/ui/icon";

// Inline static SVG reuses the installed, licensed assets without a frame runtime.
const icons = {
	home: Home01Icon,
	plus: Add01Icon,
	search: Search01Icon,
	user: UserIcon,
	wallet: Wallet01Icon,
	chart: ChartHistogramIcon,
	analytics: Analytics01Icon,
	calendar: Calendar01Icon,
	location: Location01Icon,
	plane: Airplane01Icon,
	settings: Settings01Icon,
	circle: Menu01Icon,
};

function canonicalIconId(value: string | undefined): keyof typeof icons {
	return value && Object.hasOwn(icons, value)
		? (Object.keys(icons).find(
				(key): key is keyof typeof icons => key === value,
			) ?? "circle")
		: "circle";
}

const svgCache = new Map<string, string>();

export function renderCanonicalIcon(id: string): string {
	const key = canonicalIconId(id);
	const cached = svgCache.get(key);
	if (cached) return cached;
	const markup = renderToStaticMarkup(<Icon icon={icons[key]} size={20} />);
	svgCache.set(key, markup);
	return markup;
}
