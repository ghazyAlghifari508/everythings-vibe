import type { CodebaseAnalysis } from "./analysis-schema";

// === Tech stack inference from codebase analysis (for /ask auto-select) ===

export interface InferredTechAnswers {
	frontend?: string;
	backend?: string;
	fullstackFramework?: string;
	database?: string;
	deployment?: string;
}

export function inferTechAnswersFromCodebase(
	analysis: CodebaseAnalysis,
	platform: "web" | "mobile" = "web",
): InferredTechAnswers {
	const out: InferredTechAnswers = {};
	const framework = (analysis.framework ?? "").toLowerCase();
	const deps = (analysis.dependencies ?? []).map((d) => d.toLowerCase());
	const dbStr = (analysis.database ?? "").toLowerCase();
	const modulePaths = (analysis.moduleMap ?? []).map((m) =>
		m.path.toLowerCase(),
	);
	const relevantPaths = (analysis.relevantFiles ?? []).map((p) =>
		p.toLowerCase(),
	);
	const allPaths = [...modulePaths, ...relevantPaths];

	const hasDep = (...names: string[]) =>
		deps.some((d) => names.some((n) => d.includes(n)));
	const hasPath = (...fragments: string[]) =>
		allPaths.some((p) => fragments.some((f) => p.includes(f)));

	if (platform === "mobile") {
		if (framework.includes("flutter") || hasDep("flutter")) {
			out.frontend = "Flutter";
		} else if (framework.includes("expo") || hasDep("expo")) {
			out.frontend = "Expo";
		} else if (framework.includes("react native") || hasDep("react-native")) {
			out.frontend = "React Native";
		} else if (framework.includes("ionic") || hasDep("@ionic")) {
			out.frontend = "Ionic";
		} else if (framework.includes("capacitor") || hasDep("@capacitor")) {
			out.frontend = "Capacitor";
		}
	} else {
		// Fullstack checks first
		if (
			framework.includes("tanstack start") ||
			hasDep("@tanstack/react-start", "@tanstack/start")
		) {
			out.fullstackFramework = "TanStack Start (FE+BE)";
		} else if (
			framework.includes("next") ||
			hasDep("next") ||
			hasPath("pages/api", "app/api")
		) {
			out.fullstackFramework = "Next.js (FE+BE)";
		} else if (framework.includes("nuxt") || hasDep("nuxt")) {
			out.fullstackFramework = "Nuxt.js (FE+BE)";
		} else if (framework.includes("sveltekit") || hasDep("@sveltejs/kit")) {
			out.fullstackFramework = "SvelteKit (FE+BE)";
		} else if (framework.includes("remix") || hasDep("@remix-run")) {
			out.fullstackFramework = "Remix (FE+BE)";
		} else if (framework.includes("astro") || hasDep("astro")) {
			out.fullstackFramework = "Astro (FE+BE)";
		} else {
			// Standalone Frontend checks
			if (framework.includes("react") || hasDep("react")) {
				out.frontend = "React (Vite)";
			} else if (framework.includes("vue") || hasDep("vue")) {
				out.frontend = "Vue.js";
			} else if (framework.includes("svelte") || hasDep("svelte")) {
				out.frontend = "Svelte";
			} else if (framework.includes("angular") || hasDep("@angular")) {
				out.frontend = "Angular";
			} else if (framework.includes("solid") || hasDep("solid-js")) {
				out.frontend = "Solid";
			}
		}
	}

	// Backend checks (if not already fullstack)
	if (!out.fullstackFramework) {
		if (hasDep("hono")) {
			out.backend = "Hono";
		} else if (hasDep("express")) {
			out.backend = "Express.js";
		} else if (hasDep("fastify")) {
			out.backend = "Fastify";
		} else if (hasDep("@nestjs/core", "nestjs")) {
			out.backend = "NestJS";
		} else if (hasDep("@supabase/supabase-js", "supabase")) {
			out.backend = "Supabase (BaaS)";
		} else if (hasDep("firebase", "firebase-admin")) {
			out.backend = "Firebase (BaaS)";
		} else if (hasDep("convex")) {
			out.backend = "Convex (BaaS)";
		} else if (hasDep("insforge", "@insforge")) {
			out.backend = "Insforge (BaaS)";
		} else if (analysis.language?.toLowerCase().includes("go")) {
			out.backend = "Go";
		} else if (analysis.language?.toLowerCase().includes("python")) {
			out.backend = "Python (FastAPI)";
		}
	}

	// Database checks
	if (
		dbStr.includes("postgres") ||
		dbStr.includes("pg") ||
		hasDep("pg", "postgres", "@vercel/postgres") ||
		(hasDep("drizzle-orm") &&
			!dbStr.includes("sqlite") &&
			!dbStr.includes("mysql"))
	) {
		out.database = "PostgreSQL";
	} else if (dbStr.includes("mysql") || hasDep("mysql", "mysql2")) {
		out.database = "MySQL";
	} else if (dbStr.includes("sqlite") || hasDep("better-sqlite3", "sqlite3")) {
		out.database = "SQLite";
	} else if (dbStr.includes("mongo") || hasDep("mongodb", "mongoose")) {
		out.database = "MongoDB";
	} else if (dbStr.includes("redis") || hasDep("ioredis", "redis")) {
		out.database = "Redis";
	} else if (dbStr.includes("supabase") || hasDep("@supabase/supabase-js")) {
		out.database = "Supabase Postgres";
	} else if (dbStr.includes("neon") || hasDep("@neondatabase/serverless")) {
		out.database = "Neon";
	} else if (dbStr.includes("turso") || hasDep("@libsql/client")) {
		out.database = "Turso";
	}

	// Deployment checks
	if (hasPath("vercel.json") || hasDep("@vercel/node")) {
		out.deployment = "Vercel";
	} else if (hasPath("netlify.toml") || hasDep("@netlify/functions")) {
		out.deployment = "Netlify";
	} else if (hasPath("fly.toml")) {
		out.deployment = "Fly.io";
	} else if (hasPath("railway.json")) {
		out.deployment = "Railway";
	} else if (hasPath("dockerfile", "docker-compose")) {
		out.deployment = "Docker / VPS";
	} else if (
		out.frontend === "React (Vite)" ||
		out.fullstackFramework?.includes("Next.js") ||
		out.fullstackFramework?.includes("TanStack Start")
	) {
		out.deployment = "Vercel";
	}

	return out;
}
