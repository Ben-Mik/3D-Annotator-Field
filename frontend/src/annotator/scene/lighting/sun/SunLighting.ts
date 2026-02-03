import {
	DirectionalLight,
	Color as ThreeColor,
	Vector3,
	type Light,
} from "three";
import { PERSPECTIVE_TO_VECTOR3 } from "~entity/Perspective";
import {
	BooleanSetting,
	ColorSetting,
	NumberSetting,
} from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import type { Scene } from "../../Scene";
import type { Model } from "../../model/Model";
import { DEFAULT_LIGHT_COLOR, SceneLighting } from "../SceneLighting";
import { SunPositionSetting } from "./SunPositionSetting";

export const SUN_LIGHTING_SETTINGS = {
	lightColor: new ColorSetting("lightColor", DEFAULT_LIGHT_COLOR),
	isActive: new BooleanSetting("isActive", true),
	intensity: new NumberSetting("intensity", { initial: 1, min: 0, max: 5 }),
	followCamera: new BooleanSetting("followCamera", false),
	sunPosition: new SunPositionSetting("sunPosition", {
		vector: PERSPECTIVE_TO_VECTOR3.TOP,
		perspective: "TOP",
	}),
};

const settingsRegistry = new LocalStorageSettingsRegistry("sunLighting-APw7T");
settingsRegistry.registerMultiple(SUN_LIGHTING_SETTINGS);

export class SunLighting extends SceneLighting {
	private readonly settings;

	private readonly scene: Scene<Model>;
	private readonly sunLight: DirectionalLight;

	constructor(scene: Scene<Model>) {
		super();

		this.settings = createSettingsManager(SUN_LIGHTING_SETTINGS);

		this.scene = scene;

		this.sunLight = new DirectionalLight(
			this.settings.lightColor,
			this.settings.isActive ? this.settings.intensity : 0
		);
		this.sunLight.position.copy(this.settings.sunPosition.vector);

		this.settings.onChange("lightColor", ({ new: color }) => {
			this.sunLight.color = new ThreeColor(color);
		});

		this.settings.onChange("isActive", ({ new: isActive }) => {
			this.sunLight.intensity = isActive ? this.settings.intensity : 0;
		});

		this.settings.onChange("intensity", ({ new: intensity }) => {
			if (this.settings.isActive) {
				this.sunLight.intensity = intensity;
			}
		});

		this.settings.onChange("sunPosition", ({ new: sunPosition }) => {
			this.sunLight.position.copy(sunPosition.vector);
		});
	}

	protected override getLights(): Light[] {
		return [this.sunLight];
	}

	public setSunToCurrenCameraPosition(): void {
		const cameraDirection = this.getCameraDirection();
		this.settings.sunPosition = {
			vector: cameraDirection,
			perspective: null,
		};
		this.settings.followCamera = false;
	}

	private getCameraDirection(): Vector3 {
		const cameraDirection = new Vector3();
		this.scene.camera.getWorldDirection(cameraDirection);
		cameraDirection.multiplyScalar(-1);
		return cameraDirection;
	}

	public override update(): void {
		if (this.settings.isActive && this.settings.followCamera) {
			this.sunLight.position.copy(this.getCameraDirection());
		}
	}

	public override destroy(): void {
		super.destroy();
		this.settings.unsubscribeAll();
	}
}
