"use client";

// Compatibility facade for the task whiteboard canvas domain.
//
// Canonical implementations live in `src/features/greenfield/`:
// - `types/whiteboard.ts` — LayoutNode, LayoutEdge, container contracts.
// - `utils/whiteboard-layout.ts` — constants, containerH, layoutTaskGraph.
// - `components/whiteboard/whiteboard-icons.tsx` — FeatureIcon, faseBadge.
// - `components/whiteboard/canvas-connectors.tsx` — Edges, dot style.
// - `components/whiteboard/canvas-node.tsx` — Root/Feature/Container nodes.
// - `components/whiteboard/canvas-modal.tsx` — ContainerModal.
// - `components/whiteboard/canvas-loading.tsx` — SKELETON_TREE, SkeletonDiagram (internal).
// - `components/whiteboard/whiteboard-canvas.tsx` — WhiteboardCanvas orchestration.
//
// This module re-exports the canonical implementations so every existing
// `@/components/task/whiteboard-canvas` import keeps working without
// behavioral change. Viewport state stays in `@/hooks/use-canvas-zoom`;
// no second viewport hook is introduced.

export * from "@/features/greenfield/components/whiteboard/canvas-connectors";
export * from "@/features/greenfield/components/whiteboard/canvas-modal";
export * from "@/features/greenfield/components/whiteboard/canvas-node";
export * from "@/features/greenfield/components/whiteboard/whiteboard-canvas";
export * from "@/features/greenfield/components/whiteboard/whiteboard-icons";
export type * from "@/features/greenfield/types/whiteboard";
export * from "@/features/greenfield/utils/whiteboard-layout";
