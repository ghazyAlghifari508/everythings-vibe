/**
 * Compact guidance for a single selected element edit (P8 auto-apply path;
 * this only supplies the judgment the edit needs).
 *
 * A full page standard would invite a whole-page restyle, so this is
 * deliberately scoped: one element, existing system, no new chrome.
 */
export const EVVIBE_ELEMENT_REVISION_GUIDANCE = `<ELEMENT_REVISION_GUIDANCE>
Edit only the selected element. Keep the surrounding composition, the shared tokens, the spacing rhythm and the type scale untouched.
Do not add badges, icons, gradients, shadows or sections that were not requested; do not restyle siblings; do not change the root id or the element's semantic role.
Keep text real and complete: no lorem, no truncation to fit, no invented numbers or labels. Keep alt text and accessible names accurate after the edit.
If the request cannot be satisfied inside this element, refuse instead of editing the page around it.
</ELEMENT_REVISION_GUIDANCE>`;
