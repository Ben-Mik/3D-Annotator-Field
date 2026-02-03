import {
	AmbientLight,
	DirectionalLight,
	Color as ThreeColor,
	type Light,
} from "three";
import { PERSPECTIVE_TO_VECTOR3 } from "~entity/Perspective";
import { ColorSetting, NumberSetting } from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { DEFAULT_LIGHT_COLOR, SceneLighting } from "../SceneLighting";

export const GLOBAL_LIGHTING_SETTINGS = {
	lightColor: new ColorSetting("lightColor", DEFAULT_LIGHT_COLOR),
	intensity: new NumberSetting("intensity", { initial: 1, min: 0, max: 2 }),
};

const settingsRegistry = new LocalStorageSettingsRegistry(
	"globalLighting-riY56"
);
settingsRegistry.registerMultiple(GLOBAL_LIGHTING_SETTINGS);

/**
 * A simple SceneLighting
 */
export class GlobalLighting extends SceneLighting {
	private readonly settings;

	private readonly ambientLight: AmbientLight;
	private readonly directionalLights: DirectionalLight[];

	constructor() {
		super();

		this.settings = createSettingsManager(GLOBAL_LIGHTING_SETTINGS);

		this.settings.onChange("lightColor", ({ new: color }) => {
			this.setLightColor(color);
		});

		this.settings.onChange("intensity", ({ new: intensity }) => {
			this.setLightIntensity(intensity);
		});

		this.ambientLight = new AmbientLight(this.settings.lightColor);

		const light1 = new DirectionalLight(this.settings.lightColor);
		light1.position.copy(PERSPECTIVE_TO_VECTOR3.TOP);
		const light2 = new DirectionalLight(this.settings.lightColor);
		light2.position.copy(PERSPECTIVE_TO_VECTOR3.BOTTOM);
		const light3 = new DirectionalLight(this.settings.lightColor);
		light3.position.copy(PERSPECTIVE_TO_VECTOR3.FRONT);
		const light4 = new DirectionalLight(this.settings.lightColor);
		light4.position.copy(PERSPECTIVE_TO_VECTOR3.BACK);
		const light5 = new DirectionalLight(this.settings.lightColor);
		light5.position.copy(PERSPECTIVE_TO_VECTOR3.LEFT);
		const light6 = new DirectionalLight(this.settings.lightColor);
		light6.position.copy(PERSPECTIVE_TO_VECTOR3.RIGHT);

		this.directionalLights = [
			light1,
			light2,
			light3,
			light4,
			light5,
			light6,
		];

		this.setLightIntensity(this.settings.intensity);
	}

	private setLightColor(color: number): void {
		for (const light of this.directionalLights) {
			light.color = new ThreeColor(color);
		}
		this.ambientLight.color = new ThreeColor(color);
	}

	private setLightIntensity(intensity: number): void {
		for (const light of this.directionalLights) {
			light.intensity = intensity;
		}
		this.ambientLight.intensity = intensity;
	}

	protected getLights(): Light[] {
		return [this.ambientLight, ...this.directionalLights];
	}

	public override destroy(): void {
		super.destroy();
		this.settings.unsubscribeAll();
	}
}
