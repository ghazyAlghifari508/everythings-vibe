import type { EvvibeDesignReference } from "../skill-contract";

/**
 * The contract between generated markup and Studio's trusted prototype
 * runtime. Generated HTML never carries scripts or handlers: it declares
 * intent as inert `data-proto-*` attributes, the server validates them into a
 * manifest, and the viewer executes only that manifest.
 */
export const prototypeInteractions: EvvibeDesignReference = {
	id: "prototype-interactions",
	title: "Prototype interactions",
	body: `Decide from the screen's task which controls must work in the interactive prototype, and declare each with inert attributes. Never write <script>, on* handlers or javascript: URLs; every working control needs a real intent, and a button with no intended action is not allowed.
- Action: data-proto-action="navigate|back|open_dialog|close_dialog|select_tab|expand|collapse|toggle|set_mock_state|filter_collection|validate_form|submit_mock_form|show_feedback" on a real <a>, <button> or input.
- Navigate: data-proto-target="<planned screen name or destination id>" using only screens that exist in this project; an unplanned page is shown as unavailable, so do not link to one. Keep canonical data-destination, data-studio-back and data-studio-action as they are.
- Dialog: <div data-proto-dialog="id" hidden role="dialog" aria-labelledby=...> opened by data-proto-action="open_dialog" data-proto-target="id" and closed by close_dialog; give it a visible close control.
- Tabs: triggers data-proto-action="select_tab" data-proto-tab-group="g" data-proto-tab="t" with role="tab"; panels data-proto-tab-panel="t" data-proto-tab-group="g", only the first visible.
- Disclosure: data-proto-region="id" on the content (add hidden when it starts collapsed) controlled by expand, collapse or toggle with data-proto-target="id".
- Search and filter: data-proto-collection="id" around the list, data-proto-item on each record with optional data-proto-tags="a b" and data-proto-keywords, a data-proto-empty element for no results, a search <input data-proto-action="filter_collection" data-proto-target="id"> and tag buttons that add data-proto-tag="a".
- Forms: data-proto-form="id" on the <form> with required, type and pattern attributes plus data-proto-error text; the primary submit uses data-proto-action="submit_mock_form" data-proto-target="id" with data-proto-success="<screen>" and data-proto-feedback="short confirmation". Choices that later pages need use data-proto-bind-input="key" on the input and data-proto-bind="key" on text that displays it; data-proto-show-if="key=value" reveals dependent content.
- Mock state: data-proto-action="set_mock_state" data-proto-state-key="k" data-proto-state-value="v" for selections such as a payment method; data-proto-default-key and data-proto-default-value declare documented initial values.
- Data stays clearly fictional: example names, @example.com addresses, sample amounts. Never ask for a real password, card number, bank account or OTP; a checkout offers method choices and a simulated outcome only.
- Interactive states must be visible in the markup: open and closed dialog, selected tab, empty and filled list, error and success feedback.`,
};
