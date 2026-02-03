import { type Perspective } from "~entity/Perspective";
import { type Destroyable, type Updatable } from "~entity/Types";
import { NumberSetting, StringSetting } from "~settings/Settings";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import type { Camera, CameraType } from "../Camera";

export const CAMERA_CONTROLS_SETTINGS = {
	fov: new NumberSetting("fov", { initial: 30, min: 30, max: 90 }),
	cameraType: new StringSetting<CameraType>(
		"cameraType",
		"PerspectiveCamera"
	),
};

const settingsRegistry = new LocalStorageSettingsRegistry(
	"cameraControls-WJ47v"
);
settingsRegistry.registerMultiple(CAMERA_CONTROLS_SETTINGS);

export interface CameraControls extends Updatable, Destroyable {
	getCamera(): Camera;
	/**
	 * Sets the camera to a new {@link Perspective}
	 *
	 * @param perspective the {@link Perspective}
	 */
	setCameraPerspective(perspective: Perspective): void;

	/**
	 * Returns the distance of the camera to the target after a
	 * camera perspective has been set.
	 */
	getPerspectiveDistance(): number;
	enable(): void;
	disable(): void;
	resetControls(): void;
}
