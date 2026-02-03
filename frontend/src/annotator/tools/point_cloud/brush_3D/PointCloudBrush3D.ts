import {
	Matrix4,
	Raycaster,
	Vector3,
	type Box3,
	type Mesh as ThreeMesh,
} from "three";
import { INTERSECTED, NOT_INTERSECTED } from "three-mesh-bvh";
import { type AnnotationManager } from "~annotator/annotation/AnnotationManager";
import { type UndoManager } from "~annotator/annotation/undo/UndoManager";
import { type Scene } from "~annotator/scene/Scene";
import { type PointCloud } from "~annotator/scene/model/PointCloud";
import { Tool } from "~annotator/tools/Tool";
import {
	createDefaultSphereScaleSetting,
	createDefaultSphereSettings,
	Sphere,
} from "~annotator/tools/common/elements/sphere/Sphere";
import { type ListenerBundle } from "~annotator/tools/common/listener/Listener";
import { MouseButtons } from "~annotator/tools/common/listener/PointerListenerBundle";
import { PointerUndoHandler } from "~annotator/tools/common/undo/PointerUndoHandler";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { NumberSetting } from "~settings/Settings";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { PointCloudBrush3DButton } from "./PointCloudBrush3DButton";
import { PointCloudBrush3DQuickSettingsView } from "./PointCloudBrush3DQuickSettingsView";
import { PointCloudBrush3DSettingsView } from "./PointCloudBrush3DSettingsView";

export interface Parameters {
	size: number;
	raycastThreshold: number;
}

const NAME = "POINT_CLOUD_BRUSH_3D";

export const POINT_CLOUD_BRUSH_3D_SETTINGS = {
	scale: createDefaultSphereScaleSetting(),
	sphere: createDefaultSphereSettings(),
	raycastThreshold: new NumberSetting("raycastThreshold", {
		initial: 0.1,
		min: 0.001,
		max: 1,
	}),
};

const settingsRegistry = new LocalStorageSettingsRegistry(NAME + "-rk6Kq");
settingsRegistry.registerMultiple(POINT_CLOUD_BRUSH_3D_SETTINGS);

/**
 * A brush tool to select point clouds
 * (inspired by https://github.com/gkjohnson/three-mesh-bvh)
 */
export class PointCloudBrush3D extends Tool<PointCloud> {
	// initialized in this.onLoad()
	private brush!: Sphere;

	// initialized in this.onUpdate()
	private bvhMesh!: ThreeMesh;

	private undoHandler = new PointerUndoHandler(this.undoManager);

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<PointCloud>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [this.pointerListenerBundle];
	}

	protected override onLoad(): void {
		this.brush = new Sphere(
			POINT_CLOUD_BRUSH_3D_SETTINGS.scale,
			Sphere.calculateSceneHeightScaleFactor(this.scene),
			POINT_CLOUD_BRUSH_3D_SETTINGS.sphere
		);
	}

	protected override onSelected(): void {
		this.scene.addSceneSubject(this.brush);
	}

	protected override onUpdate(): void {
		this.bvhMesh = this.scene.getModel().getBVHMesh();

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

	private updateBrush() {
		if (!this.pointer.hasMoved) {
			return;
		}

		const selectedPoint = this.selectPoint();

		if (!selectedPoint) {
			this.brush.setInvisible();
		} else {
			this.brush.setPosition(selectedPoint);
			this.brush.getPosition().applyMatrix4(this.bvhMesh.matrixWorld);
			this.brush.setVisible();
		}
	}

	/**
	 * Selects position where to select in the point cloud
	 *
	 * @returns the the position
	 */
	private selectPoint(): Vector3 | null {
		const raycaster = new Raycaster();
		raycaster.setFromCamera(this.pointer.position, this.scene.camera);

		const inverseMatrix = new Matrix4();
		inverseMatrix.copy(this.bvhMesh.matrixWorld).invert();
		raycaster.ray.applyMatrix4(inverseMatrix);

		const threshold = POINT_CLOUD_BRUSH_3D_SETTINGS.raycastThreshold.get();
		const localThreshold =
			threshold /
			((this.bvhMesh.scale.x +
				this.bvhMesh.scale.y +
				this.bvhMesh.scale.z) /
				3);
		const localThresholdSq = localThreshold * localThreshold;
		let selectionPosition = null;

		const { ray } = raycaster;
		let closestDistance = Infinity;
		this.bvhMesh.geometry.boundsTree!.shapecast({
			boundsTraverseOrder: (box: Box3) => {
				// traverse the closer bounds first.
				return box.distanceToPoint(ray.origin);
			},
			intersectsBounds: (box, _isLeaf, score) => {
				// if we've already found a point that's closer then the full bounds then
				// don't traverse further.
				if (score! > closestDistance) {
					return NOT_INTERSECTED;
				}

				box.expandByScalar(localThreshold);
				return ray.intersectsBox(box) ? INTERSECTED : NOT_INTERSECTED;
			},
			intersectsTriangle: (triangle) => {
				const distancesToRaySq = ray.distanceSqToPoint(triangle.a);
				if (distancesToRaySq < localThresholdSq) {
					// track the closest found point distance so we can early out traversal and only
					// use the closest point along the ray.
					const distanceToPoint = ray.origin.distanceTo(triangle.a);
					if (distanceToPoint < closestDistance) {
						closestDistance = distanceToPoint;
						selectionPosition = new Vector3().copy(triangle.a);
					}
				}
			},
		});
		return selectionPosition;
	}

	/**
	 * Annotates the intersections found by the bvh intersections
	 */
	private annotate() {
		if (!this.brush.isVisible()) {
			return;
		}

		const indices = this.getSphereIntersections(this.brush.getPosition());
		const translatedIndices = this.scene
			.getModel()
			.translateBVHIndices(indices);

		this.annotationManager.annotate(translatedIndices);
	}

	/**
	 * Returns all all points intersecting with the brush sphere
	 *
	 * @param selectionPosition the selection position
	 * @returns all intersecting points
	 */
	private getSphereIntersections(selectionPosition: Vector3): number[] {
		const selectionRadius = this.brush.getEffectiveRadius();
		const selectionRadiusSq = selectionRadius * selectionRadius;
		const points: number[] = [];

		this.bvhMesh.geometry.boundsTree!.shapecast({
			intersectsBounds: (box) => {
				const boxCenter = box.getCenter(new Vector3());
				const boxRadius = box.getSize(new Vector3()).length() / 2;
				const centerToSphere = selectionPosition.distanceTo(boxCenter);

				// should return NOT_INTERSECTED / INTERSECTED / CONTAINED equivalent to 0 / 1 / 2
				return (
					+(selectionRadius > centerToSphere - boxRadius) +
					+(selectionRadius > centerToSphere + boxRadius)
				);
			},
			intersectsTriangle: (triangle, triangleIndex, contained) => {
				if (contained) {
					points.push(triangleIndex * 3);
					return false;
				}
				if (
					triangle.a.distanceToSquared(selectionPosition) <
					selectionRadiusSq
				) {
					points.push(triangleIndex * 3);
				}
				return false;
			},
		});

		return points;
	}

	public getToolButtonComponent() {
		return PointCloudBrush3DButton;
	}

	public override getSettingsComponent() {
		return PointCloudBrush3DSettingsView;
	}

	public getQuickSettingsComponent() {
		return PointCloudBrush3DQuickSettingsView;
	}
}
