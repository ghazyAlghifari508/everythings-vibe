// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as facade from "@/components/task/whiteboard-canvas";
import {
	BoardHandle,
	DOT_BG_IMAGE,
	Edges,
	getCanvasDotStyle,
} from "@/features/greenfield/components/whiteboard/canvas-connectors";
import { ContainerModal } from "@/features/greenfield/components/whiteboard/canvas-modal";
import {
	ContainerNode,
	FeatureNode,
	RootNode,
} from "@/features/greenfield/components/whiteboard/canvas-node";
import { WhiteboardCanvas } from "@/features/greenfield/components/whiteboard/whiteboard-canvas";
import {
	FeatureIcon,
	faseBadgeClass,
	featureIconName,
} from "@/features/greenfield/components/whiteboard/whiteboard-icons";
import {
	COLORS,
	containerH,
	LEVEL_GAP_X,
	layoutTaskGraph,
	MAX_VISIBLE_CONTAINER_ROWS,
	SIBLING_GAP_Y,
	SUBFEATURE_CONTAINER_W,
} from "@/features/greenfield/utils/whiteboard-layout";

describe("whiteboard modular compatibility", () => {
	it("facade re-exports canonical layout primitives by reference", () => {
		expect(facade.layoutTaskGraph).toBe(layoutTaskGraph);
		expect(facade.containerH).toBe(containerH);
		expect(facade.COLORS).toBe(COLORS);
		expect(facade.LEVEL_GAP_X).toBe(LEVEL_GAP_X);
		expect(facade.SIBLING_GAP_Y).toBe(SIBLING_GAP_Y);
		expect(facade.MAX_VISIBLE_CONTAINER_ROWS).toBe(MAX_VISIBLE_CONTAINER_ROWS);
		expect(facade.SUBFEATURE_CONTAINER_W).toBe(SUBFEATURE_CONTAINER_W);
	});

	it("facade re-exports canonical UI primitives by reference", () => {
		expect(facade.WhiteboardCanvas).toBe(WhiteboardCanvas);
		expect(facade.Edges).toBe(Edges);
		expect(facade.BoardHandle).toBe(BoardHandle);
		expect(facade.RootNode).toBe(RootNode);
		expect(facade.FeatureNode).toBe(FeatureNode);
		expect(facade.ContainerNode).toBe(ContainerNode);
		expect(facade.ContainerModal).toBe(ContainerModal);
		expect(facade.FeatureIcon).toBe(FeatureIcon);
		expect(facade.featureIconName).toBe(featureIconName);
		expect(facade.faseBadgeClass).toBe(faseBadgeClass);
		expect(facade.getCanvasDotStyle).toBe(getCanvasDotStyle);
		expect(facade.DOT_BG_IMAGE).toBe(DOT_BG_IMAGE);
	});

	it("layout stays deterministic across identical inputs", () => {
		const tree = {
			features: [
				{
					name: "Katalog",
					tasks: [
						{
							name: "Kartu produk",
							description: "",
							priority: "medium" as const,
							covers: [],
							surfaces: [],
							status: "completed",
							subtasks: [],
						},
					],
				},
			],
		};
		const first = layoutTaskGraph(tree, "Toko");
		const second = layoutTaskGraph(tree, "Toko");
		expect(second).toEqual(first);
		expect(first.width).toBeGreaterThan(0);
		expect(first.height).toBeGreaterThan(0);
	});

	it("empty trees stay empty and container height clamps", () => {
		const empty = layoutTaskGraph({ features: [] }, "Kasir Pintar");
		expect(empty.nodes).toHaveLength(0);
		expect(empty.width).toBe(0);
		expect(containerH(0)).toBe(containerH(1));
		expect(containerH(MAX_VISIBLE_CONTAINER_ROWS + 5)).toBeGreaterThan(
			containerH(MAX_VISIBLE_CONTAINER_ROWS),
		);
	});
});
