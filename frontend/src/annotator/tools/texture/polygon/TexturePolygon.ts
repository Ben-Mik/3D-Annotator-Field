import {
	BufferGeometry,
	Float32BufferAttribute,
	Line,
	Line3,
	LineBasicMaterial,
	Matrix4,
	Vector3,
	type Mesh as ThreeMesh,
} from "three";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import { getHeightAt, getWidthAt, type Camera } from "~annotator/scene/Camera";
import type { Scene } from "~annotator/scene/Scene";
import type { TextureMesh } from "~annotator/scene/model/TextureMesh";
import { Tool } from "~annotator/tools/Tool";
import type {
	ListenerBundle,
	ListenerConfig,
} from "~annotator/tools/common/listener/Listener";
import type { CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import { pointRayCrossesSegments } from "~annotator/tools/common/utils/MathUtils";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import { calculatePolygonIntersection } from "~annotator/tools/common/utils/SelectionsUtils";
import { EventManager } from "~events/EventManager";
import type { Subscribable } from "~events/Events";
import { ColorSetting } from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { TexturePolygonButton } from "./TexturePolygonButton";
import { TexturePolygonHelpContent } from "./TexturePolygonHelpContent";
import { TexturePolygonQuickSettingsView } from "./TexturePolygonQuickSettingsView";
import { TexturePolygonSettingsView } from "./TexturePolygonSettingsView";

const NAME = "TEXTURE_POLYGON";

const DISTANCE_FROM_CAMERA = 0.1;

export enum PolygonToolState {
	INACTIVE,
	ACTIVE,
	SELECTED,
}

export const MIN_POINTS = 3;

export const TEXTURE_POLYGON_SETTINGS = {
	lineColor: new ColorSetting("lineColor", 0xff9800),
};

const settingsRegistry = new LocalStorageSettingsRegistry(NAME + "-Mk6mD");
settingsRegistry.registerMultiple(TEXTURE_POLYGON_SETTINGS);

export type TexturePolygonEvents = {
	stateChange: PolygonToolState;
	pointCountChange: number;
};

export class TexturePolygon
	extends Tool<TextureMesh>
	implements Subscribable<TexturePolygonEvents>
{
	private readonly settings;

	private readonly eventManager = new EventManager<TexturePolygonEvents>();
	public on = this.eventManager.on.bind(this.eventManager);

	private mesh!: ThreeMesh;
	private walker!: CanvasPositionsWalker;

	private selectionPoints: number[] = [];
	private selectionShape!: Line<BufferGeometry, LineBasicMaterial>;
	private selectionShapeNeedsUpdate = false;

	private state = PolygonToolState.INACTIVE;
	private preview = false;

	private pointerMoveListenerConfig: ListenerConfig<"pointermove"> = {
		name: "pointermove",
		listener: this.pointerMoveListener.bind(this),
	};

	private pointerDownListenerConfig: ListenerConfig<"pointerup"> = {
		name: "pointerup",
		listener: this.pointerUpListener.bind(this),
	};

	private keyDownListenerBound = this.keyDownListener.bind(this);
	private keyUpListenerBound = this.keyUpListener.bind(this);

	private listenerBundle = {
		configs: [
			this.pointerMoveListenerConfig,
			this.pointerDownListenerConfig,
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

		this.settings = createSettingsManager(TEXTURE_POLYGON_SETTINGS);

		this.settings.onChange("lineColor", ({ new: color }) => {
			this.selectionShape.material =
				this.createSelectionShapeMaterial(color);
		});
	}

	public override getToolButtonComponent() {
		return TexturePolygonButton;
	}

	public override getQuickSettingsComponent() {
		return TexturePolygonQuickSettingsView;
	}

	public override getSettingsComponent() {
		return TexturePolygonSettingsView;
	}

	public override getHelpContentComponent() {
		return TexturePolygonHelpContent;
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [this.pointerListenerBundle, this.listenerBundle];
	}

	protected override onLoad(): void {
		this.mesh = this.scene.getModel().getMesh();

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

	protected override onDestroy(): void {
		this.settings.unsubscribeAll();
		this.eventManager.destroy();
		for (const camera of this.scene.cameras) {
			camera.remove(this.selectionShape);
		}
		this.selectionShape.geometry.dispose();
	}

	protected override onSelected(): void {
		this.scene.camera.add(this.selectionShape);
		document.addEventListener("keydown", this.keyDownListenerBound);
		document.addEventListener("keyup", this.keyUpListenerBound);

		if (
			this.state === PolygonToolState.ACTIVE ||
			this.state === PolygonToolState.SELECTED
		) {
			this.scene.getCameraControls().disable();
		}
	}

	protected override onUnselected(): void {
		this.scene.camera.remove(this.selectionShape);
		document.removeEventListener("keydown", this.keyDownListenerBound);
		document.removeEventListener("keyup", this.keyUpListenerBound);
		this.scene.getCameraControls().enable();
	}

	protected override onUpdate(): void {
		if (this.selectionShapeNeedsUpdate) {
			this.updateSelectionShape();
			this.selectionShapeNeedsUpdate = false;
		}

		this.selectionShape.scale.set(
			getWidthAt(this.scene.camera, DISTANCE_FROM_CAMERA),
			getHeightAt(this.scene.camera, DISTANCE_FROM_CAMERA),
			1
		);
	}

	protected override onCameraChange(
		oldCamera: Camera,
		newCamera: Camera
	): void {
		oldCamera.remove(this.selectionShape);
		newCamera.add(this.selectionShape);
	}

	private setState(state: PolygonToolState) {
		this.state = state;
		this.eventManager.emit("stateChange", this.state);
	}

	public getState(): PolygonToolState {
		return this.state;
	}

	private pointerUpListener(event: PointerEvent) {
		if (event.button !== 0 || this.state === PolygonToolState.SELECTED) {
			return;
		}

		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

		if (this.state === PolygonToolState.INACTIVE) {
			this.startPolygon(nx, ny);
		}

		this.addPointToPolygon(nx, ny);
	}

	private pointerMoveListener(event: PointerEvent) {
		if (this.state !== PolygonToolState.ACTIVE || this.preview) {
			return;
		}

		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

		this.moveLastPolygonPoint(nx, ny);
	}

	private keyDownListener(event: KeyboardEvent) {
		if (event.key === "Shift" && this.state === PolygonToolState.ACTIVE) {
			this.showPreview();
		} else if (
			(event.key === "d" ||
				event.key === "D" ||
				event.key === "Delete" ||
				event.key === "Backspace") &&
			this.state !== PolygonToolState.INACTIVE
		) {
			this.removeLastPoint();
		} else if (
			event.key === "a" ||
			event.key === "A" ||
			event.key === "Enter"
		) {
			if (
				this.state === PolygonToolState.ACTIVE &&
				this.getNumberOfPoints() >= MIN_POINTS
			) {
				this.concludePolygon();
			} else if (this.state === PolygonToolState.SELECTED) {
				this.annotate();
				this.undoManager.endGroup();
			}
		} else if (
			event.key === "Escape" &&
			this.state !== PolygonToolState.INACTIVE
		) {
			this.abort();
		}
	}

	private keyUpListener(event: KeyboardEvent) {
		if (event.key === "Shift") {
			this.hidePreview();
		}
	}

	private updateSelectionShape(): void {
		const previousLength = this.selectionPoints.length;

		// connect last point with first point
		this.selectionPoints.push(
			this.selectionPoints[0],
			this.selectionPoints[1],
			this.selectionPoints[2]
		);

		this.selectionShape.geometry.setAttribute(
			"position",
			new Float32BufferAttribute(this.selectionPoints, 3, false)
		);

		this.selectionPoints.length = previousLength;

		// always render, even when not in sight
		this.selectionShape.frustumCulled = false;
	}

	private startPolygon(x: number, y: number): void {
		this.setState(PolygonToolState.ACTIVE);
		this.scene.getCameraControls().disable();
		this.undoManager.startGroup();
		this.selectionPoints.push(x, y, 0);
		this.selectionShape.visible = true;
	}

	private addPointToPolygon(x: number, y: number): void {
		this.selectionPoints.push(x, y, 0);
		this.selectionShapeNeedsUpdate = true;
		this.eventManager.emit("pointCountChange", this.getNumberOfPoints());
	}

	private moveLastPolygonPoint(x: number, y: number) {
		const length = this.selectionPoints.length;
		this.selectionPoints[length - 3] = x;
		this.selectionPoints[length - 2] = y;
		this.selectionShapeNeedsUpdate = true;
	}

	public showPreview(): void {
		if (this.preview) {
			return;
		}

		this.preview = true;
		this.removeLastPointIfPossible();
	}

	private removeLastPointIfPossible(): void {
		if (
			(this.preview && this.selectionPoints.length === 3) ||
			(!this.preview && this.selectionPoints.length === 6)
		) {
			return;
		}

		this.selectionPoints.length -= 3;
		this.selectionShapeNeedsUpdate = true;
		this.eventManager.emit("pointCountChange", this.getNumberOfPoints());
	}

	public removeLastPoint(): void {
		if (this.state === PolygonToolState.INACTIVE) {
			return;
		}

		const position = this.pointer.position;

		if (this.state === PolygonToolState.SELECTED) {
			this.moveLastPolygonPoint(position.x, position.y);
			this.setState(PolygonToolState.ACTIVE);
			return;
		}

		if (
			(this.preview && this.selectionPoints.length === 3) ||
			(!this.preview && this.selectionPoints.length === 6)
		) {
			this.endPolygon();
			return;
		}

		this.selectionPoints.length -= 3;
		this.selectionShapeNeedsUpdate = true;

		if (!this.preview) {
			this.moveLastPolygonPoint(position.x, position.y);
		}

		this.eventManager.emit("pointCountChange", this.getNumberOfPoints());
	}

	private endPolygon(): void {
		this.scene.getCameraControls().enable();
		this.selectionPoints.length = 0;
		this.selectionShape.visible = false;
		this.setState(PolygonToolState.INACTIVE);
	}

	public getNumberOfPoints(): number {
		const count = this.selectionPoints.length / 3;
		return this.preview ? count : count - 1;
	}

	public concludePolygon(): void {
		if (this.getNumberOfPoints() < MIN_POINTS) {
			throw new Error(`At least ${MIN_POINTS} vertices are required.`);
		}

		if (!this.preview) {
			this.removeLastPointIfPossible();
		}

		this.setState(PolygonToolState.SELECTED);
	}

	public abort(): void {
		this.endPolygon();
	}

	public hidePreview(): void {
		this.preview = false;

		if (this.state !== PolygonToolState.ACTIVE) {
			return;
		}

		const position = this.pointer.position;
		this.addPointToPolygon(position.x, position.y);
	}

	private toScreenSpaceMatrix = new Matrix4();
	private boxPoints = new Array(8).fill(0).map(() => new Vector3());
	private boxLines = new Array(12).fill(0).map(() => new Line3());
	private polygonSegments: Line3[] = [];
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
			this.polygonSegments,
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
					(pointRayCrossesSegments(position, this.polygonSegments) &
						1) ===
					1
				);
			}
		);

		this.endPolygon();

		this.annotationManager.annotate(indices);
	}
}
