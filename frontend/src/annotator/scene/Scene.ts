import { ok, type Result } from "neverthrow";
import {
	OrthographicCamera as ThreeOrthographicCamera,
	PerspectiveCamera as ThreePerspectiveCamera,
	Scene as ThreeScene,
	WebGLRenderer,
} from "three";
import Stats from "three/examples/jsm/libs/stats.module";
import type { CacheScope } from "~cache/index";
import { type Destroyable } from "~entity/Types";
import { EventManager } from "~events/EventManager";
import type { Observer, Subscribable } from "~events/Events";
import { ColorSetting } from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import {
	type Camera,
	type OrthographicCamera,
	type PerspectiveCamera,
} from "./Camera";
import { ArcballCameraControls } from "./controls/ArcballCameraControls";
import {
	CAMERA_CONTROLS_SETTINGS,
	type CameraControls,
} from "./controls/CameraControls";
import { GlobalLighting } from "./lighting/global/GlobalLighting";
import { SunLighting } from "./lighting/sun/SunLighting";
import { type LoaderError } from "./model/loader/Loader";
import { type Model } from "./model/Model";
import { SceneManager } from "./SceneManager";
import { type SceneSubject } from "./SceneSubject";

export const SCENE_SETTINGS = {
	backgroundColor: new ColorSetting("backgroundColor", 0x3c3c3c),
};

const settingsRegistry = new LocalStorageSettingsRegistry("scene-kX9pB");
settingsRegistry.registerMultiple(SCENE_SETTINGS);

const ORTHOGRAPHIC_CAMERA_CONFIG = {
	FRUSTUM_SIZE: 100,
	MIN_CLIP: 0.1,
	MAX_CLIP: 100_000,
};

const PERSPECTIVE_CAMERA_CONFIG = {
	// min. distance of visible objects
	MIN_CLIP: 0.1,
	// max. distance of visible objects
	MAX_CLIP: 10_000,
	// initial x position of the camera
	INIT_CAM_X: 0,
};

export type SceneEvents = {
	beforeRender: void;
};

export abstract class Scene<T extends Model>
	implements Subscribable<SceneEvents>, Destroyable
{
	private readonly settings;

	private readonly eventManager = new EventManager<SceneEvents>();
	public on = this.eventManager.on.bind(this.eventManager);

	private readonly orthographicCamera: OrthographicCamera;
	private readonly perspectiveCamera: PerspectiveCamera;

	public readonly renderer: WebGLRenderer;

	protected readonly cacheScope: CacheScope;

	protected model?: T;

	private readonly parentElement: HTMLDivElement;
	private readonly resizeHandler: () => void;
	private readonly scene: ThreeScene;
	private readonly sceneSubjects = new Set<SceneSubject>();
	private readonly renderObservers = new Set<Observer<void>>();

	private cameraControls?: CameraControls;

	private readonly stats = new Stats();

	private running = false;

	private globalLighting = new GlobalLighting();

	private sunLighting: SunLighting;

	/**
	 * Constructs a new Scene
	 *
	 * @param sceneParent the element which to add the rendere's dom element to
	 */
	constructor(scope: CacheScope, sceneParent: HTMLDivElement) {
		this.settings = createSettingsManager(SCENE_SETTINGS);

		this.cacheScope = scope;

		this.parentElement = sceneParent;
		const rect = sceneParent.getBoundingClientRect();

		this.perspectiveCamera = this.createPerspectiveCamera(
			rect.width,
			rect.height
		);
		this.orthographicCamera = this.createOrthographicCamera(
			rect.width,
			rect.height
		);

		this.scene = new ThreeScene();

		this.sunLighting = new SunLighting(this);

		this.renderer = this.createRenderer(rect.width, rect.height);
		this.settings.onChange("backgroundColor", ({ new: color }) => {
			this.renderer.setClearColor(color);
		});

		this.resizeHandler = this.handleResize.bind(this);
	}

	/**
	 * Sets the Scene up
	 */
	public setup() {
		this.addSceneSubject(this.globalLighting);
		this.addSceneSubject(this.sunLighting);
		this.parentElement.appendChild(this.renderer.domElement);
		window.addEventListener("resize", this.resizeHandler);
	}

	/**
	 * Creates a SceneManager
	 *
	 * @returns the SceneManager
	 */
	public createSceneManager(): SceneManager {
		return new SceneManager(this, this.scene, this.stats);
	}

	/**
	 * Creates a Model initializes it and adds it to to the scene subject array.
	 *
	 * @param files the model files
	 * @param onProgress the {@link observer}
	 */
	public async initializeModel(
		files: File[],
		onProgress?: Observer<number>
	): Promise<Result<undefined, LoaderError>> {
		this.model = this.createModel();
		const res = await this.model.initializeModel(files, onProgress);
		if (res.isErr()) {
			return res;
		}
		this.addSceneSubject(this.model);

		this.cameraControls = new ArcballCameraControls(
			this,
			this.orthographicCamera,
			this.perspectiveCamera,
			this.renderer,
			this.scene
		);
		this.scene.add(this.orthographicCamera);
		this.scene.add(this.perspectiveCamera);

		return ok(undefined);
	}

	/**
	 * Creates a Model
	 *
	 * @returns a model of type T
	 */
	protected abstract createModel(): T;

	public startRenderLoop(): void {
		this.running = true;
		this.update();
	}

	/**
	 * 1. Updates the camera controls and all scene subjects
	 * 2. then notifies all render observers,
	 * 3. then requests new Animation frame.
	 * Update is executed recursively and can be topped when this.running is set to false.
	 */
	private update(): void {
		if (!this.running) {
			return;
		}

		this.stats.begin();

		this.cameraControls!.update();

		for (const subject of this.sceneSubjects) {
			subject.update();
		}

		this.eventManager.emit("beforeRender", undefined);

		this.renderer.render(this.scene, this.camera);

		this.stats.end();
		requestAnimationFrame(this.update.bind(this));
	}

	/**
	 * stops the render loop
	 */
	public stopRenderLoop(): void {
		this.running = false;
	}

	/**
	 * The currently active camera.
	 *
	 * Throws an error if the model is not yet initialized.
	 */
	public get camera(): Camera {
		if (!this.cameraControls) {
			throw new Error("Camera not initialized, use initializeModel()");
		}

		return this.cameraControls.getCamera();
	}

	public get cameras(): Camera[] {
		return [
			this.orthographicCamera as Camera,
			this.perspectiveCamera as Camera,
		];
	}

	/**
	 * Returns the camera controls
	 * @returns the camera controls
	 */
	public getCameraControls() {
		if (!this.cameraControls) {
			throw new Error("Controls not initialized, use initializeModel().");
		}
		return this.cameraControls;
	}

	/**
	 * returns the currently used Model
	 * @returns the Model
	 */
	public getModel(): T {
		if (!this.model) {
			throw new Error("Model not initialized, use initializeModel().");
		}
		return this.model;
	}

	public getGlobalLighting(): GlobalLighting {
		if (!this.globalLighting) {
			throw new Error("Lighting not initialized.");
		}
		return this.globalLighting;
	}

	public getSunLighting(): SunLighting {
		if (!this.sunLighting) {
			throw new Error("Lighting not initialized.");
		}
		return this.sunLighting;
	}

	/**
	 * Adds a new scene subject to the scene and adds it to the list of scene subjects
	 *
	 * @param sceneSubject the scene subject
	 */
	public addSceneSubject(sceneSubject: SceneSubject): void {
		this.sceneSubjects.add(sceneSubject);
		this.scene.add(...sceneSubject.getObjects());
	}

	/**
	 * Removes the scene subject from the scene and removes it from the list of scene subjects
	 *
	 * @param sceneSubject the scene subject
	 */
	public removeSceneSubject(sceneSubject: SceneSubject): void {
		this.scene.remove(...sceneSubject.getObjects());
		this.sceneSubjects.delete(sceneSubject);
	}

	/**
	 * Destroys the scene
	 * 1. stops render loop
	 * 2. clears all observers
	 * 2. clears the scene
	 * 3. destroys all scene subjects
	 * 4. clears all scene subjects
	 * 5. destroys the camera controls
	 */
	public destroy() {
		this.settings.unsubscribeAll();
		this.eventManager.destroy();

		this.stopRenderLoop();

		if (this.parentElement.contains(this.renderer.domElement)) {
			this.parentElement.removeChild(this.renderer.domElement);
		}

		window.removeEventListener("resize", this.resizeHandler);

		this.renderObservers.clear();

		this.scene.clear();

		for (const subject of this.sceneSubjects) {
			subject.destroy();
		}
		this.sceneSubjects.clear();

		if (this.cameraControls) {
			this.cameraControls.destroy();
			this.cameraControls = undefined;
		}
	}

	/**
	 * Returns the canvas element
	 *
	 * @returns the canvas element
	 */
	public getCanvas(): HTMLCanvasElement {
		return this.renderer.domElement;
	}

	public getAspect(): number {
		return this.renderer.domElement.width / this.renderer.domElement.height;
	}

	private createPerspectiveCamera(
		width: number,
		height: number
	): PerspectiveCamera {
		const aspectRatio = width / height;
		const camera = new ThreePerspectiveCamera(
			CAMERA_CONTROLS_SETTINGS.fov.get(),
			aspectRatio,
			PERSPECTIVE_CAMERA_CONFIG.MIN_CLIP,
			PERSPECTIVE_CAMERA_CONFIG.MAX_CLIP
		);
		return camera as PerspectiveCamera;
	}

	private createOrthographicCamera(
		width: number,
		height: number
	): OrthographicCamera {
		const aspectRatio = width / height;
		const frustumSize = ORTHOGRAPHIC_CAMERA_CONFIG.FRUSTUM_SIZE;
		const camera = new ThreeOrthographicCamera(
			(frustumSize * aspectRatio) / -2,
			(frustumSize * aspectRatio) / 2,
			frustumSize / 2,
			-frustumSize / 2,
			ORTHOGRAPHIC_CAMERA_CONFIG.MIN_CLIP,
			ORTHOGRAPHIC_CAMERA_CONFIG.MAX_CLIP
		);
		return camera as OrthographicCamera;
	}

	/**
	 * Creates a new WebGLRenderer
	 * @return the renderer
	 */
	private createRenderer(width: number, height: number): WebGLRenderer {
		const renderer = new WebGLRenderer({
			antialias: true,
		});
		renderer.setClearColor(SCENE_SETTINGS.backgroundColor.get());
		renderer.setSize(width, height);
		return renderer;
	}

	private handleResize() {
		const rect = this.parentElement.getBoundingClientRect();
		const newAspectRatio = rect.width / rect.height;

		// orthographic camera
		const frustumSize = ORTHOGRAPHIC_CAMERA_CONFIG.FRUSTUM_SIZE;
		this.orthographicCamera.left = (frustumSize * newAspectRatio) / -2;
		this.orthographicCamera.right = (frustumSize * newAspectRatio) / 2;
		this.orthographicCamera.top = frustumSize / 2;
		this.orthographicCamera.bottom = -frustumSize / 2;
		this.orthographicCamera.updateProjectionMatrix();

		// perspective camera
		this.perspectiveCamera.aspect = newAspectRatio;
		this.perspectiveCamera.updateProjectionMatrix();

		this.renderer.setSize(rect.width, rect.height);
	}
}
