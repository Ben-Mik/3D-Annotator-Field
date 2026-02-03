import type { FC } from "react";
import type { Mesh as ThreeMesh } from "three";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import type { Mesh } from "~annotator/scene/model/Mesh";
import type { Scene } from "~annotator/scene/Scene";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import {
	Tool,
	type ToolButtonProps,
	type ToolQuickSettingsProps,
} from "~annotator/tools/Tool";
import { MeshFillButton } from "./MeshFillButton";
import { MeshFillQuickSettingsView } from "./MeshFillQuickSettingsView";

const NAME = "MESH_FILL";

export class MeshFill extends Tool<Mesh> {
	private mesh?: ThreeMesh;

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<Mesh>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
	}

	protected override onLoad(): void {
		this.mesh = this.scene.getModel().getMesh();
	}
	protected override onSelected(): void {
		// nothing to do
	}
	protected override onUpdate(): void {
		// nothing to do
	}
	protected override onUnselected(): void {
		// nothing to do
	}
	protected override onDestroy(): void {
		// nothing to do
	}
	protected override onCameraChange(): void {
		// nothing to do
	}
	public override getToolButtonComponent(): FC<ToolButtonProps> {
		return MeshFillButton;
	}
	public override getQuickSettingsComponent(): FC<ToolQuickSettingsProps> {
		return MeshFillQuickSettingsView;
	}

	public fill(): void {
		const indices = this.mesh!.geometry.index!.array;
		this.undoManager.startGroup();
		this.annotationManager.annotate(indices);
		this.undoManager.endGroup();
	}
}
