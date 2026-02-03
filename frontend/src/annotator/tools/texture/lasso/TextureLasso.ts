import {
	Line3,
	LineBasicMaterial,
	Matrix4,
	Vector2,
	Vector3,
	type Mesh as ThreeMesh,
} from "three";
import { Float32BufferAttribute } from "three/src/core/BufferAttribute";
import { BufferGeometry } from "three/src/core/BufferGeometry";
import { Line } from "three/src/objects/Line";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import { getHeightAt, getWidthAt, type Camera } from "~annotator/scene/Camera";
import type { TextureMesh } from "~annotator/scene/model/TextureMesh";
import type { Scene } from "~annotator/scene/Scene";
import type {
	ListenerBundle,
	ListenerConfig,
} from "~annotator/tools/common/listener/Listener";
import type { CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import { pointRayCrossesSegments } from "~annotator/tools/common/utils/MathUtils";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { calculatePolygonIntersection } from "~annotator/tools/common/utils/SelectionsUtils";
import { Tool } from "~annotator/tools/Tool";
import { ColorSetting } from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { TextureLassoButton } from "./TextureLassoButton";
import { TextureLassoSettingsView } from "./TextureLassoSettingsView";

const NAME = "TEXTURE_LASSO";
const DISTANCE_FROM_CAMERA = 0.1;

export const TEXTURE_LASSO_SETTINGS = {
	lineColor: new ColorSetting("lineColor", 0xff9800),
};

const settingsRegistry = new LocalStorageSettingsRegistry(NAME + "-0m8E4");
settingsRegistry.registerMultiple(TEXTURE_LASSO_SETTINGS);

export class TextureLasso extends Tool<TextureMesh> {
	private readonly settings;

	private mesh!: ThreeMesh;
	private walker: CanvasPositionsWalker;

	private selectionPoints: number[] = [];
	private selectionShape!: Line;
	private selectionShapeNeedsUpdate = false;
	private selectionNeedsUpdate = false;
	private pressed = false;

	// handle building lasso shape
	private prevX = -Infinity;
	private prevY = -Infinity;

	private tempVector0 = new Vector2();
	private tempVector1 = new Vector2();
	private tempVector2 = new Vector2();

	/**
	 * The configuration for the PointerMoveListener
	 */
	private pointerMoveListenerConfig: ListenerConfig<"pointermove"> = {
		name: "pointermove",
		listener: this.pointerMoveListener.bind(this),
	};

	/**
	 * The configuration for the PointerDownListener
	 */
	private pointerDownListenerConfig: ListenerConfig<"pointerdown"> = {
		name: "pointerdown",
		listener: this.pointerDownListener.bind(this),
	};

	/**
	 * The configuration for the PointerUpListener
	 */
	private pointerUpListenerConfig: ListenerConfig<"pointerup"> = {
		name: "pointerup",
		listener: this.pointerUpListener.bind(this),
	};

	/**
	 * The Listener configurations
	 */
	private listenerConfigs = {
		configs: [
			this.pointerMoveListenerConfig,
			this.pointerDownListenerConfig,
			this.pointerUpListenerConfig,
		],
	};

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<TextureMesh>,
		selectionBuffer: SelectionBuffer
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);

		this.walker = scene.getModel().getCanvasPositionsWalker();

		this.settings = createSettingsManager(TEXTURE_LASSO_SETTINGS);

		this.settings.onChange("lineColor", ({ new: color }) => {
			this.selectionShape.material =
				this.createSelectionShapeMaterial(color);
		});
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [this.listenerConfigs];
	}

	protected override onLoad(): void {
		this.mesh = this.scene.getModel().getMesh();

		// selection shape
		this.selectionShape = new Line(
			new BufferGeometry(),
			this.createSelectionShapeMaterial(this.settings.lineColor)
		);
		this.selectionShape.renderOrder = 1;
		this.selectionShape.position.z = -DISTANCE_FROM_CAMERA;
	}

	private createSelectionShapeMaterial(color: number) {
		return new LineBasicMaterial({ color });
	}

	protected override onSelected(): void {
		this.scene.camera.add(this.selectionShape);
	}

	protected override onUpdate(): void {
		this.mesh = this.scene.getModel().getMesh();
		if (this.selectionShapeNeedsUpdate) {
			const ogLength = this.selectionPoints.length;
			this.selectionPoints.push(
				this.selectionPoints[0],
				this.selectionPoints[1],
				this.selectionPoints[2]
			);

			this.selectionShape.geometry.setAttribute(
				"position",
				new Float32BufferAttribute(this.selectionPoints, 3, false)
			);

			this.selectionPoints.length = ogLength;

			// always render, even when not in sight
			this.selectionShape.frustumCulled = false;
			this.selectionShapeNeedsUpdate = false;
		}

		if (this.selectionNeedsUpdate) {
			this.selectionNeedsUpdate = false;

			if (this.selectionPoints.length > 0) {
				this.annotate();
				if (!this.pressed) {
					this.undoManager.endGroup();
				}
			}
		}

		this.selectionShape.scale.set(
			getWidthAt(this.scene.camera, DISTANCE_FROM_CAMERA),
			getHeightAt(this.scene.camera, DISTANCE_FROM_CAMERA),
			1
		);
	}

	protected override onUnselected(): void {
		this.scene.camera.remove(this.selectionShape);
	}

	protected override onDestroy(): void {
		for (const camera of this.scene.cameras) {
			camera.remove(this.selectionShape);
		}
		this.selectionShape.geometry.dispose();
		this.settings.unsubscribeAll();
	}

	protected override onCameraChange(
		oldCamera: Camera,
		newCamera: Camera
	): void {
		oldCamera.remove(this.selectionShape);
		newCamera.add(this.selectionShape);
	}

	public getToolButtonComponent() {
		return TextureLassoButton;
	}

	public override getSettingsComponent() {
		return TextureLassoSettingsView;
	}

	public getQuickSettingsComponent() {
		return () => null;
	}

	/**
	 * The PointerUpListener
	 */
	private pointerUpListener() {
		this.pressed = false;
		this.selectionShape.visible = false;
		if (this.selectionPoints.length) {
			this.selectionNeedsUpdate = true;
		}
	}

	/**
	 * The PointerDownListener
	 */
	private pointerDownListener(event: PointerEvent) {
		this.undoManager.startGroup();
		this.pressed = true;
		this.prevX = event.clientX;
		this.prevY = event.clientY;
		this.selectionPoints.length = 0;
	}

	private pointerMoveListener(event: PointerEvent) {
		if ((1 & event.buttons) === 0) {
			return;
		}

		const ex = event.clientX;
		const ey = event.clientY;

		const nx = (event.clientX / window.innerWidth) * 2 - 1;
		const ny = -((event.clientY / window.innerHeight) * 2 - 1);

		// If the mouse hasn't moved a lot since the last point
		if (Math.abs(ex - this.prevX) >= 3 || Math.abs(ey - this.prevY) >= 3) {
			// Check if the mouse moved in roughly the same direction as the previous point
			// and replace it if so.
			const i = this.selectionPoints.length / 3 - 1;
			const i3 = i * 3;
			let doReplace = false;
			if (this.selectionPoints.length > 3) {
				// prev segment direction
				this.tempVector0.set(
					this.selectionPoints[i3 - 3],
					this.selectionPoints[i3 - 3 + 1]
				);
				this.tempVector1.set(
					this.selectionPoints[i3],
					this.selectionPoints[i3 + 1]
				);
				this.tempVector1.sub(this.tempVector0).normalize();

				// this segment direction
				this.tempVector0.set(
					this.selectionPoints[i3],
					this.selectionPoints[i3 + 1]
				);
				this.tempVector2.set(nx, ny);
				this.tempVector2.sub(this.tempVector0).normalize();

				const dot = this.tempVector1.dot(this.tempVector2);
				doReplace = dot > 0.99;
			}

			if (doReplace) {
				this.selectionPoints[i3] = nx;
				this.selectionPoints[i3 + 1] = ny;
			} else {
				this.selectionPoints.push(nx, ny, 0);
			}

			this.selectionShapeNeedsUpdate = true;
			this.selectionShape.visible = true;

			this.prevX = ex;
			this.prevY = ey;
		}
	}

	private toScreenSpaceMatrix = new Matrix4();
	private boxPoints = new Array(8).fill(0).map(() => new Vector3());
	private boxLines = new Array(12).fill(0).map(() => new Line3());
	private lassoSegments: Line3[] = [];
	private perBoundsSegments: Line3[][] = [];

	public annotate() {
		this.toScreenSpaceMatrix
			.copy(this.mesh.matrixWorld)
			.premultiply(this.scene.camera.matrixWorldInverse)
			.premultiply(this.scene.camera.projectionMatrix);

		const selectionBuffer = this.selectionBuffer;
		calculatePolygonIntersection(
			this.mesh,
			this.toScreenSpaceMatrix,
			this.boxPoints,
			this.boxLines,
			this.lassoSegments,
			this.perBoundsSegments,
			this.selectionPoints,
			selectionBuffer
		);

		const model = this.scene.getModel();
		const translatedIndicesContained = model.translateBVHIndices(
			selectionBuffer.getContained()
		);
		const translatedIndicesIntersected = model.translateBVHIndices(
			selectionBuffer.getIntersected()
		);

		const indices = this.walker.collect(
			translatedIndicesContained,
			translatedIndicesIntersected,
			(position) => {
				position.applyMatrix4(this.toScreenSpaceMatrix);
				return (
					(pointRayCrossesSegments(position, this.lassoSegments) &
						1) ===
					1
				);
			}
		);

		this.annotationManager.annotate(indices);
	}
}
