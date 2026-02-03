import { type FC } from "react";
import { Vector2 } from "three";
import type { Camera } from "~annotator/scene/Camera";
import { CAMERA_CONTROLS_SETTINGS } from "~annotator/scene/controls/CameraControls";
import { type Destroyable, type Updatable } from "~entity/Types";
import type { Unsubscribe } from "~events/Events";
import { type AnnotationManager } from "../annotation/AnnotationManager";
import { type UndoManager } from "../annotation/undo/UndoManager";
import { type Scene } from "../scene/Scene";
import { type Model } from "../scene/model/Model";
import {
	registerListenerBundles,
	unregisterListenerBundles,
	type ListenerBundle,
} from "./common/listener/Listener";
import {
	MouseButtons,
	PointerListenerBundle,
} from "./common/listener/PointerListenerBundle";
import type { SelectionBuffer } from "./common/utils/SelectionBuffer";

const DEFAULT_CURSOR: Cursor = "crosshair";

export type Cursor = "none" | "crosshair";

export interface ToolButtonProps {
	onClick: () => void;
	selected: boolean;
}

export interface ToolQuickSettingsProps {
	tool: Tool<Model>;
}

export interface ToolSettingsProps {}

export interface ToolHelpContentProps {}

/**
 * Defines an abstract structure of a tool
 */
export abstract class Tool<T extends Model> implements Updatable, Destroyable {
	protected readonly scene: Scene<T>;
	protected readonly annotationManager: AnnotationManager;
	protected readonly undoManager: UndoManager;
	protected readonly name: string;
	protected readonly selectionBuffer: SelectionBuffer;

	private unsubscribeCameraChangeListeners: Unsubscribe[] = [];
	private cameraBeforeChange?: Camera = undefined;

	/**
	 * Contains the current information about the pointer
	 */
	protected pointer = {
		hasChanged: false,
		hasMoved: false,
		position: new Vector2(),
		buttons: MouseButtons.NONE,
	};

	/**
	 * A bundle of listener often used by tools
	 */
	protected pointerListenerBundle = new PointerListenerBundle(this.pointer);

	/**
	 * Constructs an new instance of a tool
	 *
	 * @param name the name of the tool
	 * @param annotationManager an annotation manager
	 * @param scene a scene
	 * @param selectionBuffer a shared selection buffer
	 */
	constructor(
		name: string,
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<T>,
		selectionBuffer: SelectionBuffer
	) {
		this.name = name;
		this.annotationManager = annotationManager;
		this.undoManager = undoManager;
		this.scene = scene;
		this.selectionBuffer = selectionBuffer;
	}

	/**
	 * Returns a bundle of listeners often used while a tool is loading
	 *
	 * @returns a bundle of listeners
	 */
	protected getOnLoadListenerBundles(): ListenerBundle[] {
		return [];
	}

	/**
	 * Returns a bundle of listeners often used while tool is selected
	 *
	 * @returns a bundle of listeners
	 */
	protected getOnSelectedListenerBundles(): ListenerBundle[] {
		return [];
	}

	public getCursor(): Cursor {
		return DEFAULT_CURSOR;
	}

	/**
	 * Loads a tool
	 * registers all loading listener and calls {@link onLoad}
	 */
	public load(): void {
		console.log(`loading ${this.name}`);

		registerListenerBundles(
			this.scene.getCanvas(),
			this.getOnLoadListenerBundles()
		);
		this.onLoad();
	}

	/**
	 * A Method where the tool can define what happens when its loading
	 */
	protected abstract onLoad(): void;

	/**
	 * Selects the tool
	 * and calls {@link onSelected}
	 */
	public select(): void {
		console.log(`selecting ${this.name}`);
		const unsubscribeBefore = CAMERA_CONTROLS_SETTINGS.cameraType.on(
			"beforeChange",
			() => {
				this.cameraBeforeChange = this.scene.camera;
			}
		);
		const unsubscribeAfter = CAMERA_CONTROLS_SETTINGS.cameraType.on(
			"change",
			() => {
				this.onCameraChange(
					this.cameraBeforeChange!,
					this.scene.camera
				);
			}
		);
		this.unsubscribeCameraChangeListeners.push(
			unsubscribeBefore,
			unsubscribeAfter
		);
		registerListenerBundles(
			this.scene.getCanvas(),
			this.getOnSelectedListenerBundles()
		);
		this.onSelected();
	}

	/**
	 * A Method where the tool can define what happens when its selected
	 */
	protected abstract onSelected(): void;

	/**
	 * Updates the tool
	 * and calls {@link onUpdate}
	 */
	public update(): void {
		this.onUpdate();
		this.pointerListenerBundle.resetState();
	}

	/**
	 * A Method where the tool can define what happens when its unselected
	 */
	protected abstract onUpdate(): void;

	/**
	 * Selects the tool
	 * and calls {@link onUnselected}
	 */
	public unselect(): void {
		console.log(`unselecting ${this.name}`);
		for (const unsubscribe of this.unsubscribeCameraChangeListeners) {
			unsubscribe();
		}
		this.unsubscribeCameraChangeListeners = [];
		unregisterListenerBundles(
			this.scene.getCanvas(),
			this.getOnSelectedListenerBundles()
		);
		this.onUnselected();
	}

	/**
	 * A Method where the tool can define what happens when its selected
	 */
	protected abstract onUnselected(): void;

	/**
	 * Disposes the tool
	 * and calls {@link onDestroy}
	 */
	public destroy(): void {
		console.log(`disposing ${this.name}`);
		unregisterListenerBundles(
			this.scene.getCanvas(),
			this.getOnLoadListenerBundles()
		);
		this.onDestroy();
	}

	/**
	 * A Method where the tool can define what happens when it is destroyed
	 */
	protected abstract onDestroy(): void;

	/**
	 * Gets called right after the scene's camera changed while the tool was selected.
	 *
	 * @param oldCamera the old camera
	 * @param newCamera the new camera
	 */
	protected abstract onCameraChange(
		oldCamera: Camera,
		newCamera: Camera
	): void;

	/**
	 * Returns the tool button to select the tool
	 */
	public abstract getToolButtonComponent(): FC<ToolButtonProps>;

	/**
	 * Returns the quick settings component that contains all quick settings of a tool
	 */
	public abstract getQuickSettingsComponent(): FC<ToolQuickSettingsProps>;

	/**
	 * Returns an optional component containing usage info.
	 */
	public getSettingsComponent(): FC<ToolSettingsProps> | null {
		return null;
	}

	/**
	 * Returns an optional component containing usage info.
	 */
	public getHelpContentComponent(): FC<ToolHelpContentProps> | null {
		return null;
	}
}
