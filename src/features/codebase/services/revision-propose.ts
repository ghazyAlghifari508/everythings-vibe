import { validateRevisionPrdResponse } from "./revision-prd-patch";
import { buildRevisionPrdMessages } from "./revision-prompt";

type ProposalInput = Parameters<typeof buildRevisionPrdMessages>[0];
type RevisionGenerator = (
	messages: Array<{ role: "system" | "user"; content: string }>,
) => Promise<{ text: string; finishReason?: string }>;

export async function generatePrdRevisionProposal(
	input: ProposalInput,
	generate: RevisionGenerator,
) {
	const prompt = buildRevisionPrdMessages(input);
	const result = await generate([
		{ role: "system", content: prompt.system },
		{ role: "user", content: JSON.stringify(prompt.user) },
	]);
	return validateRevisionPrdResponse(
		input.base,
		result.text,
		result.finishReason,
	);
}
