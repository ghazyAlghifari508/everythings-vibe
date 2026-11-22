import type { EvvibeDesignReference } from "../skill-contract";

export const mobilePatterns: EvvibeDesignReference = {
	id: "mobile-patterns",
	title: "Mobile screen worked examples",

	viewport: "mobile",
	body: `Bad — every screen gets the same bar with a back arrow and the screen name:

  [ <  Beranda ]        <- back arrow on a top-level destination
  "Beranda"             <- title repeated in the body
  [ Card: heading + paragraph ]
  [ Card: heading + paragraph ]

Good — a top-level discovery screen with no back affordance:

  +--------------------------+
  | Brand        Search   Me |
  |                          |
  | Mau ke mana?             |
  | [ Cari destinasi       ] |
  |                          |
  | [ Destination image    ] |
  | [ Featured destination ] |
  |                          |
  | Explore   Trips   Saved  |
  +--------------------------+

Good — a detail screen where back is justified because there is a parent:

  +--------------------------+
  | <  Detail Paket    Share |
  | [ Destination photo    ] |
  | Bali Escape              |
  | 4 hari · 3 malam · Bali  |
  | Itinerary (ordered list) |
  | Fasilitas (grouped list) |
  | Rp 3.900.000   [ Pesan ] |
  +--------------------------+

Why the difference: the discovery screen is a destination the user returns to; the detail screen was reached from a list and needs a way back. The bar carries only what that screen needs — search on discovery, share on detail — never both plus notifications plus an overflow menu.

Bad — a compressed desktop row:

  [ Oat M... ] [ Descripsi... ] [ Rp ]

Good — a mobile choice row:

  [ Radio ] Oat Milk
            Susu nabati
  +Rp8.000

Why: the label and description own a full-width track, the price keeps its own non-wrapping track, and nothing essential is ellipsized to preserve a row that does not fit.

Bad — every screen as a card grid:

  [ Card ] [ Card ]
  [ Card ] [ Card ]

Good — composition follows the task: a search screen leads with the field, a checkout leads with the order summary and the action, a profile leads with the account identity and grouped settings rows.`,
};
