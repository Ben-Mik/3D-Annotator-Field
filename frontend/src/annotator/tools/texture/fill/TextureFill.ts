import type { FC } from "react";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import type {
	CanvasPositionsPerFace,
	TextureMesh,
} from "~annotator/scene/model/TextureMesh";
import type { Scene } from "~annotator/scene/Scene";
import { CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import {
	Tool,
	type ToolButtonProps,
	type ToolQuickSettingsProps,
} from "~annotator/tools/Tool";
import { TextureFillButton } from "./TextureFillButton";
import { TextureFillQuickSettingsView } from "./TextureFillQuickSettingsView";

const NAME = "TEXTURE_FILL";

export class TextureFill extends Tool<TextureMesh> {
	private canvas!: HTMLCanvasElement;

	private canvasPositionsPerFace: CanvasPositionsPerFace;

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<TextureMesh>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
		this.canvasPositionsPerFace = this.scene
			.getModel()
			.getCanvasPositionsPerFace();
	}

	protected override onLoad(): void {
		this.canvas = this.scene.getModel().getCanvas();
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
		return TextureFillButton;
	}
	public override getQuickSettingsComponent(): FC<ToolQuickSettingsProps> {
		return TextureFillQuickSettingsView;
	}

	public fill(): void {
		const canvasPositions = this.canvasPositionsPerFace.flatDataView();
		const transformed =
			CanvasPositionsWalker.canvasPositionsToLinearIndices(
				canvasPositions,
				this.canvas.width
			);

		this.undoManager.startGroup();
		this.annotationManager.annotate(transformed);
		this.undoManager.endGroup();
	}
}
