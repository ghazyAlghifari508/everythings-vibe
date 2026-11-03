"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

// better-auth resolves the session only in the browser: SSR always renders
// with `data: null`, while the first client render may already hold a cached
// session. Reading `data` directly lets the client emit `<img>` where the
// server emitted the placeholder icon, which is a hydration mismatch.
// Returning `null` until hydration completes keeps server and first client
// markup identical; the real session flows through the same `useSession`
// subscription right after, so no extra auth request is introduced.
export function useHydratedSession() {
	const { data: session } = authClient.useSession();
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);
	return hydrated ? session : null;
}
