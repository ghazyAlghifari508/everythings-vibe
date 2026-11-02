import { createFileRoute } from "@tanstack/react-router";
import {
	handleCodebaseBulkDelete,
	handleCodebaseCreate,
	handleCodebaseList,
} from "@/features/codebase/services/library-route.server";

// Browser codebase library boundary (list + create + bulk delete).
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers server handlers only (no client component), following the
// neighboring `/api/codebases/$codebaseId/status` pattern. Never import this
// route module (or the `.server` modules) from client code.
//
// Auth (`requireUser`), tenant isolation, name provenance, the atomic
// codebase + sync-session transaction, and the documented error contract live
// in `src/features/codebase/services/library-route.server.ts`.

export const Route = createFileRoute("/api/codebases/")({
	server: {
		handlers: {
			GET: ({ request }: { request: Request }) =>
				handleCodebaseList({ request }),
			POST: ({ request }: { request: Request }) =>
				handleCodebaseCreate({ request }),
			DELETE: ({ request }: { request: Request }) =>
				handleCodebaseBulkDelete({ request }),
		},
	},
});
