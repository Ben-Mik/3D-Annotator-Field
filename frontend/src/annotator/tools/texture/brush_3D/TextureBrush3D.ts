import { Matrix4, Raycaster, Vector3, type Mesh as ThreeMesh } from "three";
import { CONTAINED, INTERSECTED, NOT_INTERSECTED } from "three-mesh-bvh";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import type { Scene } from "~annotator/scene/Scene";
import type { TextureMesh } from "~annotator/scene/model/TextureMesh";
import { Tool } from "~annotator/tools/Tool";
import type { ListenerBundle } from "~annotator/tools/common/listener/Listener";
import { MouseButtons } from "~annotator/tools/common/listener/PointerListenerBundle";
import { type CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import { PointerUndoHandler } from "~annotator/tools/common/undo/PointerUndoHandler";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import {
	createDefaultSphereScaleSetting,
	createDefaultSphereSettings,
	Sphere,
} from "../../common/elements/sphere/Sphere";
import { TextureBrushButton } from "./TextureBrush3DButton";
import { TextureBrush3DQuickSettingsView } from "./TextureBrush3DQuickSettingsView";
import { TextureBrush3DSettingsView } from "./TextureBrush3DSettingsView";

const NAME = "TEXTURE_BRUSH_3D";

export const TEXTURE_BRUSH_3D_SETTINGS = {
	scale: createDefaultSphereScaleSetting(),
	sphere: createDefaultSphereSettings(),
};

const settingsRegistry = new LocalStorageSettingsRegistry(NAME + "-KB2aq");
settingsRegistry.registerMultiple(TEXTURE_BRUSH_3D_SETTINGS);

export class TextureBrush3D extends Tool<TextureMesh> {
	private brush!: Sphere;

	private mesh!: ThreeMesh;

	private walker!: CanvasPositionsWalker;

	private undoHandler = new PointerUndoHandler(this.undoManager);

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<TextureMesh>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
		const model = this.scene.getModel();
		this.walker = model.getCanvasPositionsWalker();
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [this.pointerListenerBundle];
	}

	protected override onLoad(): void {
		this.mesh = this.scene.getModel().getMesh();
		this.brush = new Sphere(
			TEXTURE_BRUSH_3D_SETTINGS.scale,
			Sphere.calculateSceneHeightScaleFactor(this.scene),
			TEXTURE_BRUSH_3D_SETTINGS.sphere
		);
	}

	protected override onSelected(): void {
		this.scene.addSceneSubject(this.brush);
	}

	protected override onUpdate(): void {
		this.updateBrush();

		this.undoHandler.onUpdate(this.pointer);

		if (
			this.pointer.buttons === MouseButtons.PRIMARY &&
			this.pointer.hasChanged
		) {
			this.annotate();
		}
	}

	protected override onUnselected(): void {
		this.scene.removeSceneSubject(this.brush);
	}

	protected override onDestroy(): void {
		this.brush.destroy();
	}

	protected override onCameraChange(): void {
		// nothing to do
	}

	public override getToolButtonComponent() {
		return TextureBrushButton;
	}

	public override getQuickSettingsComponent() {
		return TextureBrush3DQuickSettingsView;
	}

	public override getSettingsComponent() {
		return TextureBrush3DSettingsView;
	}

	private updateBrush() {
		if (!this.pointer.hasMoved) {
			return;
		}

		const raycaster = new Raycaster();
		raycaster.setFromCamera(this.pointer.position, this.scene.camera);
		raycaster.firstHitOnly = true;

		const res = raycaster.intersectObject(this.mesh, true);

		if (res.length === 0) {
			this.brush.setInvisible();
		} else {
			this.brush.setPosition(res[0].point);
			this.brush.setVisible();
		}
	}

	private annotate() {
		if (!this.brush.isVisible()) {
			return;
		}

		const inverseMatrix = new Matrix4()
			.copy(this.mesh.matrixWorld)
			.invert();

		const sphere = this.brush.createThreeSphere();
		sphere.applyMatrix4(inverseMatrix);

		const selectionBuffer = this.selectionBuffer;
		selectionBuffer.clear();

		const tempVector = new Vector3();
		const bvh = this.mesh.geometry.boundsTree;

		bvh!.shapecast({
			intersectsBounds: (box) => {
				const intersects = sphere.intersectsBox(box);
				const { min, max } = box;
				if (!intersects) {
					return NOT_INTERSECTED;
				}
				for (let x = 0; x <= 1; x++) {
					for (let y = 0; y <= 1; y++) {
						for (let z = 0; z <= 1; z++) {
							tempVector.set(
								x === 0 ? min.x : max.x,
								y === 0 ? min.y : max.y,
								z === 0 ? min.z : max.z
							);
							if (!sphere.containsPoint(tempVector)) {
								return INTERSECTED;
							}
						}
					}
				}
				return CONTAINED;
			},

			intersectsTriangle: (triangle, i, contained) => {
				if (triangle.intersectsSphere(sphere)) {
					if (contained) {
						selectionBuffer.pushContained(i);
					} else {
						selectionBuffer.pushIntersected(i);
					}
				}

				return false;
			},
		});

		const model = this.scene.getModel();
		const translatedIndicesContained = model.translateBVHIndices(
			selectionBuffer.getContained()
		);
		const translatedIndicesIntersected = model.translateBVHIndices(
			selectionBuffer.getIntersected()
		);

		const positions = this.walker.collect(
			translatedIndicesContained,
			translatedIndicesIntersected,
			(position: Vector3) => sphere.containsPoint(position)
		);
		this.annotationManager.annotate(positions);
	}
}
