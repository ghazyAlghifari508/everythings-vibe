import type { EvvibeDesignReference } from "../skill-contract";

export const mobilePatterns: EvvibeDesignReference = {
	id: "mobile-patterns",
	title: "Mobile screen contrasts",
	viewport: "mobile",
	body: `BAD: every screen gets [ < Screen Title ] plus the title repeated in the body, then a stack of cards.
Why: back on a top-level destination is meaningless, the title is said twice, and the cards flatten three different tasks into one shape.

GOOD, discovery: brand and search in the bar, a prompt such as "Mau ke mana?", the field, one featured destination with a real photo, then the tab bar. No back.
GOOD, detail: [ < Detail Paket   Share ], object photo, object name, duration and location, itinerary as an ordered list, facilities grouped, price and the booking action at the end.
GOOD, settings: grouped rows with label and current value, destructive action separate, no search field and no hero.

Why: the class of screen decides the bar. Discovery is a destination the user returns to; detail was reached from a list and needs a way back; settings has no object to act on.

BAD row: [ Oat M… ] [ Descripsi… ] [ Rp ]
GOOD row: [ Radio ] Oat Milk / Susu nabati beneath / +Rp8.000 in its own track.
Why: nothing essential is ellipsized to keep a row that does not fit.`,
};
