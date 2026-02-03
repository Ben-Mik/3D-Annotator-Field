import { Matrix4, Raycaster, Vector3, type Mesh as ThreeMesh } from "three";
import { CONTAINED, INTERSECTED, NOT_INTERSECTED } from "three-mesh-bvh";
import { type AnnotationManager } from "~annotator/annotation/AnnotationManager";
import { type UndoManager } from "~annotator/annotation/undo/UndoManager";
import { type Scene } from "~annotator/scene/Scene";
import { type Mesh } from "~annotator/scene/model/Mesh";
import { Tool } from "~annotator/tools/Tool";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import {
	createDefaultSphereScaleSetting,
	createDefaultSphereSettings,
	Sphere,
} from "../../common/elements/sphere/Sphere";
import { type ListenerBundle } from "../../common/listener/Listener";
import { MouseButtons } from "../../common/listener/PointerListenerBundle";
import { PointerUndoHandler } from "../../common/undo/PointerUndoHandler";
import { MeshBrush3DButton } from "./MeshBrush3DButton";
import { MeshBrush3DQuickSettingsView } from "./MeshBrush3DQuickSettingsView";
import { MeshBrush3DSettingsView } from "./MeshBrush3DSettingsView";

const NAME = "MESH_BRUSH_3D";

export const MESH_BRUSH_3D_SETTINGS = {
	scale: createDefaultSphereScaleSetting(),
	sphere: createDefaultSphereSettings(),
};

const settingsRegistry = new LocalStorageSettingsRegistry(NAME + "-tj9fV");
settingsRegistry.registerMultiple(MESH_BRUSH_3D_SETTINGS);

/**
 * A brush tool to select meshes
 * (inspired by https://github.com/gkjohnson/three-mesh-bvh)
 */

export class MeshBrush3D extends Tool<Mesh> {
	// initialized in this.onLoad()
	private brush!: Sphere;

	// initialized in this.onUpdate()
	private mesh!: ThreeMesh;

	private undoHandler = new PointerUndoHandler(this.undoManager);

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<Mesh>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [this.pointerListenerBundle];
	}

	protected override onLoad(): void {
		this.brush = new Sphere(
			MESH_BRUSH_3D_SETTINGS.scale,
			Sphere.calculateSceneHeightScaleFactor(this.scene),
			MESH_BRUSH_3D_SETTINGS.sphere
		);
	}

	protected override onSelected(): void {
		this.scene.addSceneSubject(this.brush);
	}

	protected override onUpdate(): void {
		this.mesh = this.scene.getModel().getMesh();

		this.updateBrush();

		this.undoHandler.onUpdate(this.pointer);
		if (
			this.pointer.buttons === MouseButtons.PRIMARY &&
			this.brush.isVisible()
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

	/**
	 * Updates the brush sphere
	 *
	 */
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

	/**
	 * Annotates the intersections found by the bvh intersections
	 */
	private annotate() {
		if (!this.brush.isVisible()) {
			return;
		}

		const inverseMatrix = new Matrix4()
			.copy(this.mesh.matrixWorld)
			.invert();

		const sphere = this.brush.createThreeSphere();
		sphere.applyMatrix4(inverseMatrix);

		const indices: number[] = [];
		const tempVector = new Vector3();
		const bvh = this.mesh.geometry.boundsTree;

		bvh!.shapecast({
			intersectsBounds: (box) => {
				const intersects = sphere.intersectsBox(box);
				const { min, max } = box;
				if (intersects) {
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
				}
				return intersects ? INTERSECTED : NOT_INTERSECTED;
			},

			intersectsTriangle: (triangle, i, contained) => {
				if (contained || triangle.intersectsSphere(sphere)) {
					indices.push(i);
				}
				return false;
			},
		});

		const translatedIndices = this.scene
			.getModel()
			.translateBVHIndices(indices);
		this.annotationManager.annotate(translatedIndices);
	}

	public getToolButtonComponent() {
		return MeshBrush3DButton;
	}

	public getQuickSettingsComponent() {
		return MeshBrush3DQuickSettingsView;
	}

	public override getSettingsComponent() {
		return MeshBrush3DSettingsView;
	}
}
