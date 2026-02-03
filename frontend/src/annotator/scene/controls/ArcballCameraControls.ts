import {
	Vector3,
	type Box3,
	type Renderer,
	type Scene as ThreeScene,
} from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls";
import { type Perspective } from "~entity/Perspective";
import { BooleanSetting } from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { assertUnreachable } from "~util/TypeScript";
import {
	type Camera,
	type CameraType,
	type OrthographicCamera,
	type PerspectiveCamera,
} from "../Camera";
import { type Scene } from "../Scene";
import { type Model } from "../model/Model";
import {
	CAMERA_CONTROLS_SETTINGS,
	type CameraControls,
} from "./CameraControls";

export const ARCBALL_CAMERA_CONTROLS_SETTINGS = {
	showGizmos: new BooleanSetting("showGizmos", false),
};

const settingsRegistry = new LocalStorageSettingsRegistry("arcball-dB2J6");
settingsRegistry.registerMultiple(ARCBALL_CAMERA_CONTROLS_SETTINGS);

enum ArcballControlsMouseActionOperations {
	PAN = "PAN",
	ROTATE = "ROTATE",
	ZOOM = "ZOOM",
	FOV = "FOV",
}

enum ArcballControlsMouseActionKeys {
	SHIFT = "SHIFT",
	CTRL = "CTRL",
}

/**
 * Basic camera controls
 * Used to change Camera properties
 */
export class ArcballCameraControls implements CameraControls {
	private readonly settings;
	private readonly scene: Scene<Model>;
	private readonly controls: ArcballControls & { target: Vector3 };

	private readonly orthographicCamera: OrthographicCamera;
	private readonly perspectiveCamera: PerspectiveCamera;
	private currentCamera: Camera;

	private boundingBox: Box3;
	private boundingBoxMaxDimension: number;
	private distance = 0;
	private zoom = 0;

	/**
	 * Constructs new CameraControls
	 *
	 * @param camera a camera
	 * @param renderer a renderer
	 */
	constructor(
		scene: Scene<Model>,
		orthographicCamera: OrthographicCamera,
		perspectiveCamera: PerspectiveCamera,
		renderer: Renderer,
		threeScene: ThreeScene
	) {
		this.settings = createSettingsManager({
			...CAMERA_CONTROLS_SETTINGS,
			...ARCBALL_CAMERA_CONTROLS_SETTINGS,
		});

		this.scene = scene;

		this.orthographicCamera = orthographicCamera;
		this.perspectiveCamera = perspectiveCamera;
		switch (this.settings.cameraType) {
			case "PerspectiveCamera":
				this.currentCamera = this.perspectiveCamera;
				break;
			case "OrthographicCamera":
				this.currentCamera = this.orthographicCamera;
				break;
			default:
				assertUnreachable(this.settings.cameraType);
		}
		this.settings.onChange("cameraType", ({ new: cameraType }) => {
			this.setCamera(cameraType);
		});

		this.settings.onChange("fov", ({ new: fov }) => {
			this.setFOV(fov);
		});

		this.controls = this.createArcballControls(
			this.currentCamera,
			renderer,
			threeScene
		) as ArcballControls & { target: Vector3 };
		this.boundingBox = this.getBoundingBox();
		this.boundingBoxMaxDimension = this.getBoundingBoxMaxDimension();
		this.setupControls();
		this.setCameraPerspective("TOP");

		this.controls.setGizmosVisible(this.settings.showGizmos);
		this.settings.onChange("showGizmos", ({ new: showGizmos }) => {
			this.controls.setGizmosVisible(showGizmos);
		});
	}

	/**
	 * Creates controls of type {@link ArcballControls}
	 *
	 * @param camera the affected camera
	 * @param renderer the renderer
	 * @returns the created {@link ArcballControls}
	 */
	private createArcballControls(
		camera: Camera,
		renderer: Renderer,
		threeScene: ThreeScene
	): ArcballControls {
		const controls = new ArcballControls(
			camera,
			renderer.domElement,
			threeScene
		);

		controls.unsetMouseAction(0);
		controls.setMouseAction(ArcballControlsMouseActionOperations.ROTATE, 1);
		controls.setMouseAction(
			ArcballControlsMouseActionOperations.ROTATE,
			0,
			ArcballControlsMouseActionKeys.SHIFT
		);
		controls.setMouseAction(
			ArcballControlsMouseActionOperations.ROTATE,
			2,
			ArcballControlsMouseActionKeys.SHIFT
		);
		controls.unsetMouseAction(
			"WHEEL",
			ArcballControlsMouseActionKeys.SHIFT
		);

		controls.cursorZoom = true;

		return controls;
	}

	private getBoundingBox(): Box3 {
		const object = this.scene.getModel().getObject();
		object.geometry.computeBoundingBox();
		return object.geometry.boundingBox!;
	}

	private getBoundingBoxMaxDimension(): number {
		const boundingBoxSize = this.boundingBox.getSize(new Vector3());
		return Math.max(
			boundingBoxSize.x,
			boundingBoxSize.y,
			boundingBoxSize.z
		);
	}

	private setupControls(): void {
		this.calculateFitParameters();

		const boundingBoxCenter = this.boundingBox.getCenter(new Vector3());
		this.controls.target.copy(boundingBoxCenter);

		this.controls.update();
	}

	private calculateFitParameters() {
		const multiplier = 1.3;

		// orthographic camera
		const heightZoom =
			Math.abs(
				this.orthographicCamera.bottom - this.orthographicCamera.top
			) /
			(multiplier * this.boundingBoxMaxDimension);
		const widthZoom =
			Math.abs(
				this.orthographicCamera.left - this.orthographicCamera.right
			) /
			(multiplier * this.boundingBoxMaxDimension);
		this.zoom = Math.min(heightZoom, widthZoom);

		// perspective camera
		const heightDistance =
			this.boundingBoxMaxDimension /
			(2 * Math.atan((Math.PI * this.perspectiveCamera.fov) / 360));
		const widthDistance = heightDistance / this.perspectiveCamera.aspect;
		this.distance = multiplier * Math.max(heightDistance, widthDistance);
	}

	public getCamera(): Camera {
		return this.currentCamera;
	}

	private setCamera(type: CameraType) {
		this.setCameraPerspective("TOP");

		if (type === "OrthographicCamera") {
			this.currentCamera = this.orthographicCamera;
		} else if (type === "PerspectiveCamera") {
			this.currentCamera = this.perspectiveCamera;
		} else {
			assertUnreachable(type);
		}

		this.setCameraPerspective("TOP");
		this.controls.setCamera(this.currentCamera);
		this.controls.update();
	}

	private setFOV(fov: number) {
		if (this.currentCamera.isOrthographicCamera) {
			console.error("Can't change FOV on an orthographic camera!");
			return;
		}

		const oldDistance = this.perspectiveCamera.position.distanceTo(
			this.controls.target
		);
		const heightAtTarget =
			oldDistance /
			(2 * Math.atan((Math.PI * this.perspectiveCamera.fov) / 360));
		const newDistance =
			heightAtTarget * 2 * Math.atan((Math.PI * fov) / 360);
		const direction = this.perspectiveCamera.getWorldDirection(
			new Vector3()
		);
		this.perspectiveCamera.position.add(
			direction.multiplyScalar(newDistance - oldDistance)
		);

		this.perspectiveCamera.fov = fov;
		this.perspectiveCamera.updateProjectionMatrix();
		this.controls.update();

		this.calculateFitParameters();
	}

	public getPerspectiveDistance(): number {
		return this.distance;
	}

	public setCameraPerspective(perspective: Perspective): void {
		if (!this.controls.enabled) {
			return;
		}

		this.controls.reset();

		const distance = this.currentCamera.isPerspectiveCamera
			? this.distance
			: this.boundingBoxMaxDimension * 10;
		const target = this.controls.target.clone();
		switch (perspective) {
			case "TOP":
				target.setZ(target.z + distance);
				break;
			case "BOTTOM":
				target.setZ(target.z - distance);
				break;
			case "LEFT":
				target.setX(target.x + distance);
				break;
			case "RIGHT":
				target.setX(target.x - distance);
				break;
			case "FRONT":
				target.setY(target.y + distance);
				break;
			case "BACK":
				target.setY(target.y - distance);
				break;
			default:
				assertUnreachable(perspective);
		}

		this.currentCamera.position.set(target.x, target.y, target.z);
		if (this.currentCamera.isOrthographicCamera) {
			this.currentCamera.zoom = this.zoom;
			this.currentCamera.updateProjectionMatrix();
		}

		if (this.currentCamera.isPerspectiveCamera) {
			this.perspectiveCamera.fov = CAMERA_CONTROLS_SETTINGS.fov.get();
		}

		this.controls.update();
	}

	/**
	 * Resets the controls according to the initial values of the ArcballControls
	 */
	public resetControls(): void {
		this.controls.reset();
	}

	/**
	 * Enables the controls
	 */
	public enable(): void {
		this.controls.enabled = true;
		this.scene
			.getCanvas()
			.removeEventListener("contextmenu", preventContextMenu);
	}

	/**
	 * Disables the controls
	 */
	public disable(): void {
		this.controls.enabled = false;
		this.scene
			.getCanvas()
			.addEventListener("contextmenu", preventContextMenu);
	}

	/**
	 * Updates the ArcballControls
	 */
	public update(): void {
		// nothing to do
	}

	public destroy(): void {
		this.settings.unsubscribeAll();
		this.controls.dispose();
		this.scene
			.getCanvas()
			.removeEventListener("contextmenu", preventContextMenu);
	}
}

function preventContextMenu(e: MouseEvent) {
	if (e.button === 2) {
		e.preventDefault();
	}
}
