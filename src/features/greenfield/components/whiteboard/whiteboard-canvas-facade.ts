"use client";

// Compatibility facade for the task whiteboard canvas modules that live in this
// feature folder:
// - `../../types/whiteboard.ts` — LayoutNode, LayoutEdge, container contracts.
// - `../../utils/whiteboard-layout.ts` — constants, containerH, layoutTaskGraph.
// - `./whiteboard-icons.tsx` — FeatureIcon, faseBadge.
// - `./canvas-connectors.tsx` — Edges, dot style.
// - `./canvas-node.tsx` — Root/Feature/Container nodes.
// - `./canvas-modal.tsx` — ContainerModal.
// - `./canvas-loading.tsx` — SKELETON_TREE, SkeletonDiagram (internal).
// - `./whiteboard-canvas.tsx` — WhiteboardCanvas orchestration.
//
// This module re-exports those modules as one surface, and is kept alive by
// `tests/whiteboard-modules.test.ts`, which pins the re-exports by reference.
// Viewport state stays in `@/hooks/use-canvas-zoom`; no second viewport hook.

export type * from "../../types/whiteboard";
export * from "../../utils/whiteboard-layout";
export * from "./canvas-connectors";
export * from "./canvas-modal";
export * from "./canvas-node";
export * from "./whiteboard-canvas";
export * from "./whiteboard-icons";
