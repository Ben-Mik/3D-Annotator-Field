import type { FC } from "react";
import { Raycaster, type Mesh as ThreeMesh } from "three";
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
import { type CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import { PointerUndoHandler } from "~annotator/tools/common/undo/PointerUndoHandler";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { TextureTriangleButton } from "./TextureTriangleButton";

const NAME = "TEXTURE_TRIANGLE";

const EMPTY_ARRAY = new Array<number>(0);
const EMPTY_PREDICATE = () => false;

export class TextureTriangle extends Tool<TextureMesh> {
	private mesh!: ThreeMesh;
	private walker!: CanvasPositionsWalker;

	private undoHandler = new PointerUndoHandler(this.undoManager);

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
		const model = this.scene.getModel();
		this.mesh = model.getMesh();
		this.walker = model.getCanvasPositionsWalker();
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
		return TextureTriangleButton;
	}

	public override getQuickSettingsComponent(): FC<ToolQuickSettingsProps> {
		return () => null;
	}

	private annotate() {
		const raycaster = new Raycaster();
		raycaster.setFromCamera(this.pointer.position, this.scene.camera);
		raycaster.firstHitOnly = true;

		const res = raycaster.intersectObject(this.mesh, true);

		if (res.length > 0 && res[0].faceIndex) {
			this.out[0] = res[0].faceIndex;
			const model = this.scene.getModel();
			const faceIndex = model.translateBVHIndices(this.out);
			const indices = this.walker.collect(
				faceIndex,
				EMPTY_ARRAY,
				EMPTY_PREDICATE
			);

			this.annotationManager.annotate(indices);
		}
	}
}
