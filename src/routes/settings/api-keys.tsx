import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApiKeysClient } from "@/features/auth-settings/components/settings/api-keys-client";
import { loadApiKeys } from "@/features/auth-settings/services/settings-loaders.functions";

export const Route = createFileRoute("/settings/api-keys")({
	loader: async () => {
		try {
			return await loadApiKeys();
		} catch (e) {
			if ((e as Error).message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: () => ({ meta: [{ title: "API Keys - Settings" }] }),
	component: ApiKeysPage,
});

function ApiKeysPage() {
	const { keys } = Route.useLoaderData();
	return <ApiKeysClient keys={keys} />;
}
