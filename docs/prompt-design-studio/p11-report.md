# P11 FIX 03 — Reliable Pencil Editing, True Inline Text, Scoped Revisions, and Non-Intrusive Undo

**Complexity: VERY COMPLEX**  
**Execution order: 3 of 6 P11 fixes**  
**Prerequisites: P11 Fix 01 and Fix 02**  
**Followed by: P11 Fix 04**

## 1. Mission

Repair Pencil mode so it behaves like a reliable visual HTML editor.

Reported problems:

- Some elements cannot be selected despite repeated clicks.
- Some frames are selectable while others are not.
- Text editing appears inside a tiny floating textarea.
- The user cannot directly type on the original text in the frame.
- A successful edit may only appear while Pencil mode is active.
- Leaving Pencil can reveal stale content.
- The contextual menu includes an unwanted "Pilih induk" item.
- Undo feedback is oversized, visually intrusive, and stays forever.
- Undo feedback overlaps the canvas zoom controls.

Preserve the previously agreed P8 semantics:

- Edit Text: deterministic, no AI.
- Delete: deterministic, no AI.
- Edit with AI: scoped, validated, automatically applied.
- Undo: available for successful operations.

## 2. User-approved interaction contract

The user confirmed this exact workflow:

```
Activate Pencil
      |
      v
Click a meaningful text element
      |
      v
Context menu appears
      |
      v
Choose "Edit Text"
      |
      v
Text itself becomes editable
at its original position
      |
      v
User types, deletes, replaces
      |
      v
Commit valid text
      |
      v
Updated HTML displayed consistently
```

Do NOT:

- Require double-click to begin editing.
- Display a separate textarea modal.
- Display a small floating black text box.
- Move the text to another editing panel.
- Automatically invoke an LLM for simple text editing.
- Modify unrelated layout components.

The Edit Text menu action is the sole entry point to the requested direct editing mode.

## 3. Relevant source

Inspect:

- `src/features/studio/components/canvas/studio-element-menu.tsx`
- `src/features/studio/components/canvas/studio-live-surface.tsx`
- `src/features/studio/hooks/use-studio-element-editing.ts`
- `src/features/studio/services/studio-element-inspection.ts`
- `src/features/studio/services/studio-element-document.ts`
- `src/features/studio/services/studio-element-patch.ts`
- `src/features/studio/services/studio-element-revision.ts`
- `src/features/studio/services/studio-element-transition.ts`
- `src/features/studio/utils/studio-element-bridge.ts`
- `src/features/studio/components/workspace/studio-element-feedback.tsx`
- `src/features/studio/hooks/use-studio-live-pool.ts`
- Related persistence, authorization, and revision history code.

At the audited revision:

- The element menu includes "Pilih induk".
- Edit Text uses an overlay textarea.
- Frame HTML editing and normal canvas screenshot display can disagree.
- The live pool may not prioritize the inspected frame.
- Undo feedback is rendered whenever the persistent undo row exists.

Fix the causes, not merely the appearance.

## 4. Reliable element selection

Pencil should be able to select meaningful editable content on every ready HTML frame.

Selection must work across:

- Text.
- Buttons.
- Cards.
- Images and media containers.
- Navigation items.
- Lists.
- Forms.
- Sections.
- Nested content.
- Frames at different zoom levels.
- Frames newly mounted after virtualization.

Do not make everything selectable indiscriminately.

Ignore:

- Hidden elements.
- Editor overlays.
- Internal bridge markers.
- Unrelated EvVibe application UI.
- Invalid or unsupported document nodes.

A selected target must have a stable identity tied to:

- Project.
- Frame.
- Committed revision.
- Element identity.
- Required document hash/channel.

Coordinate transforms must account for:

- Canvas zoom.
- Canvas pan.
- Iframe position.
- Frame scrolling policy.
- Bounding-client rectangles.
- Device resizing.

Ensure that hovering and clicking behave consistently.

Do not use screenshot coordinates as element identities.

## 5. Selection presentation

Provide restrained selection feedback.

Hover:

- Clear, thin outline around meaningful target.
- Accurate bounds.
- No excessive glow.
- No permanently filled overlay.
- No layout shift.

Selected:

- Distinct outline.
- Contextual menu positioned near target.
- No collision with frame edges.
- No clipping outside iframe viewport.
- Remains usable at different canvas zoom levels.

If an introductory animation is retained, it must be subtle, temporary, and respect reduced motion.

Do not flash the entire document to explain selection.

## 6. Context menu

Allowed actions for non-text targets:

```
Edit Element
---------------------
Edit with AI
Delete
```

Allowed actions for editable text:

```
Edit Element
---------------------
Edit Text
Edit with AI
Delete
```

Remove:

- "Pilih induk".
- Any helper copy implying parent selection is required.
- Any redundant action unrelated to the agreed workflow.

Parent/ancestor targeting may still exist internally as a technical selection algorithm. It must not appear as an extra user-facing menu option.

Preserve a clear close action.

Use appropriate menu or popover components from the existing EvVibe frontend stack; prefer mature accessible components where suitable.

## 7. True inline Edit Text

Implement direct editing inside the trusted iframe document.

Preferred behavior:

1. The user clicks Edit Text.
2. The selected supported text node/range enters editing mode.
3. The editable text remains at its original position.
4. Existing typography and layout stay visible.
5. The caret appears in the actual text.
6. The user can type, delete, select all, paste plain text, and replace.
7. Escape cancels.
8. The appropriate commit gesture saves changes.
9. The committed text is patched into the original complete HTML.
10. The renderer shows the new committed revision.

Use native editing capabilities such as supported `contenteditable` behavior inside the trusted editing boundary when suitable.

Do not make the entire iframe contenteditable.

Do not use unsafe uncontrolled `innerHTML` assignment for user input.

Treat pasted text as text unless explicit rich-text support is safely implemented.

### Text preservation

A text edit must not silently remove:

- Nested icons.
- Emphasis.
- Links.
- Sibling text.
- Child elements.
- Parent structure.
- Styling classes.

For complex mixed-content nodes, determine the supported editable text range.

If an element is not safely editable as a single text target, provide an honest non-destructive response rather than replacing the parent's entire `textContent`.

### Keyboard behavior

Specify appropriate behavior for:

- Escape.
- Enter.
- Shift+Enter.
- Tab.
- Blur.
- IME composition.
- Paste.
- Undo/cancel.

Do not accidentally submit midway through IME composition.

Avoid submitting when the user simply clicks into text.

Keep focus inside the editing context only while editing.

## 8. Deterministic persistence

Edit Text must:

- Use a deterministic scoped patch.
- Preserve the original full HTML.
- Avoid LLM calls.
- Avoid credit deduction.
- Avoid full-frame generation.
- Avoid generation shimmer.
- Validate revision identity before commit.
- Validate the resulting HTML.
- Atomically persist the new revision.
- Reconcile the live renderer.

Example:

```
Before:
<span>1</span>

User edit:
1 -> 2

After:
<span>2</span>
```

The frame must display `2` in normal mode, Pencil, device switching, after refresh, and after workspace reload.

Do not update only the transient iframe DOM.

The persisted HTML is authoritative.

## 9. Delete

Delete must remain a direct deterministic operation.

Expected:

```
Select target
    |
Delete
    |
Target disappears
    |
Revision persisted
    |
Undo available
```

No AI request or credit deduction.

Only the selected authorized target may be removed.

Preserve unrelated content.

If persistence fails, restore the last committed valid document.

Deleting a target must reconcile affected selection and prototype metadata without introducing broken references.

## 10. Edit with AI

Preserve the existing interaction:

```
Select target
    |
Edit with AI
    |
Attach element to chat composer
    |
User submits scoped instruction
    |
AI generates candidate
    |
Validate schema, scope, HTML, and revision
    |
Auto Apply
    |
Undo available
```

The model should receive compact relevant `evvibe-design` revision guidance.

Do not add runtime component browsing.

Do not add a separate mandatory Preview → Apply modal.

Do not allow the AI to redesign unrelated frame regions.

Reject stale edits.

Do not fabricate success when AI patch validation fails.

## 11. Undo feedback and persistent history

Current feedback stays visible while the undo row exists.

That is incorrect because revision history persists longer than a transient success notification.

Separate two concepts:

```
Revision history:
Persistent undo capability.

Success feedback:
Temporary, dismissible notification.
```

Desired design:

```
┌─────────────────────────────┐
│ Teks diperbarui   Undo   × │
└─────────────────────────────┘
```

Requirements:

- Compact single-row feedback where space permits.
- Clear text, not oversized card.
- No decorative success badges.
- Accessible Undo button.
- Explicit dismiss action.
- Auto-dismiss after a sensible duration.
- Pause or accommodate interaction when appropriate.
- Accessible status announcement.
- Respect reduced motion.
- No reappearance solely because history is loaded from persistence.
- Undo remains available from a durable revision-history interaction when toast disappears.

Position it so it never blocks:

- Canvas zoom +/-.
- Frame toolbar.
- Right-side tool palette.
- Chat composer.
- Primary frame content being edited.

Use existing toast infrastructure or an appropriate established accessible component rather than inventing another floating notification design system.

Do not permanently remove Undo to make the toast disappear.

## 12. Error handling

Handle:

- Stale element identity.
- Frame revision changes during editing.
- Deleted element.
- Non-editable target.
- Renderer remount.
- Delayed iframe messages.
- Failed persistence.
- Network failure.
- Undo after another revision.
- Permission mismatch.
- Validation failure.

Do not hide actual errors behind an indefinite success notification.

Do not manually manipulate the database to resolve revision mismatches.

## 13. Targeted tests — no Browser QA

Required tests:

- Element selection on first, middle, and last frame.
- Selection after lazy mounting.
- Geometry at different canvas zoom levels.
- Text-specific menu with exactly three actions.
- Non-text menu with exactly two actions.
- No "Pilih induk".
- Edit Text enters in-frame editing, not overlay textarea.
- Text selection and replacement.
- Escape cancellation.
- Paste handling.
- Mixed-content preservation.
- No-op edit does not create revision.
- Deterministic edit uses no LLM or credits.
- Delete uses no LLM or credits.
- AI edit remains scoped and Auto Apply.
- Stale version rejection.
- Undo after direct edit.
- Undo after deletion.
- Undo after AI edit.
- Same committed HTML rendered in all modes.
- Temporary toast lifecycle.
- Undo remains available after toast dismissal.
- Toast placement does not collide with fixed canvas controls under layout calculations.
- Old unapproved candidates do not auto-apply.

Use unit/integration tests and existing React component tests.

No comprehensive browser QA here; that belongs to P12.

## 14. Deliverables

Report:

- Selection root causes.
- New inline editing implementation.
- Removed menu behavior.
- Persistence and safety design.
- Revision consistency.
- Undo toast lifecycle.
- Adopted UI components.
- Actual test results.
- Known limitations.

Do not modify unrelated AI generation design rules.

Do not commit, push, merge, or deploy without authorization.

**Definition of done: every eligible frame can be inspected, text is edited directly in the rendered HTML, changes persist across modes, and Undo is useful without obstructing the workspace.**
