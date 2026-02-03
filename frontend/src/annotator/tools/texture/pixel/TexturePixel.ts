import type { FC } from "react";
import { Raycaster, Vector2, type Mesh as ThreeMesh } from "three";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import type { Scene } from "~annotator/scene/Scene";
import type { TextureMesh } from "~annotator/scene/model/TextureMesh";
import {
	Tool,
	type ToolButtonProps,
	type ToolQuickSettingsProps,
} from "~annotator/tools/Tool";
import type { ListenerBundle } from "~annotator/tools/common/listener/Listener";
import { MouseButtons } from "~annotator/tools/common/listener/PointerListenerBundle";
import { CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import { UvFaceRasterizer } from "~annotator/tools/common/texture/UvFaceRasterizer";
import { PointerUndoHandler } from "~annotator/tools/common/undo/PointerUndoHandler";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { TexturePixelButton } from "./TexturePixelButton";

const NAME = "TEXTURE_PIXEL";

export class TexturePixel extends Tool<TextureMesh> {
	private mesh!: ThreeMesh;
	private canvas!: HTMLCanvasElement;

	private undoHandler = new PointerUndoHandler(this.undoManager);

	private tmpVector = new Vector2();
	private out = [0];

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<TextureMesh>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [this.pointerListenerBundle];
	}

	protected override onLoad(): void {
		this.mesh = this.scene.getModel().getMesh();
		this.canvas = this.scene.getModel().getCanvas();
	}

	protected override onSelected(): void {
		// nothing to do
	}

	protected override onUpdate(): void {
		this.undoHandler.onUpdate(this.pointer);

		if (this.pointer.buttons === MouseButtons.PRIMARY) {
			this.annotate();
		}
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
		return TexturePixelButton;
	}

	public override getQuickSettingsComponent(): FC<ToolQuickSettingsProps> {
		return () => null;
	}

	private annotate() {
		const raycaster = new Raycaster();
		raycaster.setFromCamera(this.pointer.position, this.scene.camera);
		raycaster.firstHitOnly = true;

		const res = raycaster.intersectObject(this.mesh, true);

		if (res.length > 0 && res[0].uv) {
			UvFaceRasterizer.uvToCanvasPosition(
				res[0].uv,
				this.canvas.width,
				this.canvas.height,
				this.tmpVector
			);

			this.out[0] = CanvasPositionsWalker.canvasPositionToLinearIndex(
				this.tmpVector,
				this.canvas.width
			);

			this.annotationManager.annotate(this.out);
		}
	}
}
