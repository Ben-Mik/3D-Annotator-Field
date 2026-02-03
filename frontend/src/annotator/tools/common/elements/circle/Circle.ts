import {
	ColorSetting,
	NumberSetting,
	PercentageSetting,
} from "settings/Settings";
import {
	CircleGeometry,
	MeshStandardMaterial,
	Mesh as ThreeMesh,
	type Object3D,
} from "three";
import type { SceneSubject } from "~annotator/scene/SceneSubject";
import { createSettingsManager } from "~settings/SettingsManager";

export function createDefaultCircleScaleSetting() {
	return new PercentageSetting("scale", 10, 200);
}

export type CircleSettings = ReturnType<typeof createDefaultCircleSettings>;

export function createDefaultCircleSettings() {
	return {
		segments: new NumberSetting("segments", {
			initial: 64,
			min: 3,
			max: 1024,
		}),
		opacity: new PercentageSetting("opacity", 50),
		color: new ColorSetting("color", 0xec407a),
		emissiveColor: new ColorSetting("emissiveColor", 0xec407a),
		emissiveIntensity: new PercentageSetting("emissiveIntensity", 50),
	};
}

export class Circle implements SceneSubject {
	private readonly settings;
	private readonly mesh: ThreeMesh;

	private geometry: CircleGeometry;
	private material: MeshStandardMaterial;
	private scaleFactor!: number;

	constructor(
		scaleSetting: PercentageSetting,
		scaleFactor = 1,
		settings?: CircleSettings
	) {
		const mergedCircleSettings = {
			...createDefaultCircleSettings(),
			...settings,
		};

		this.settings = createSettingsManager({
			scale: scaleSetting,
			circle: mergedCircleSettings,
		});

		this.settings.onChange("scale", ({ new: scale }) => {
			this.mesh.scale.setScalar(this.getScaleScalar(scale));
		});

		this.settings.circle.onChange("segments", () => {
			this.resetGeometry();
		});

		this.settings.circle.onChange(
			["color", "opacity", "emissiveColor", "emissiveIntensity"],
			() => {
				this.resetMaterial();
			}
		);

		this.geometry = this.createGeometry();
		this.material = this.createMaterial();

		this.mesh = new ThreeMesh(this.geometry, this.material);
		this.setScaleFactor(scaleFactor);
		this.setInvisible();
	}

	private createGeometry() {
		return new CircleGeometry(1, this.settings.circle.segments);
	}

	private createMaterial() {
		return new MeshStandardMaterial({
			transparent: true,
			premultipliedAlpha: true,
			color: this.settings.circle.color,
			opacity: PercentageSetting.toNumber(this.settings.circle.opacity),
			emissive: this.settings.circle.emissiveColor,
			emissiveIntensity: PercentageSetting.toNumber(
				this.settings.circle.emissiveIntensity
			),
		});
	}

	private resetGeometry() {
		this.geometry = this.createGeometry();
		this.mesh.geometry = this.geometry;
	}

	private resetMaterial() {
		this.material = this.createMaterial();
		this.mesh.material = this.material;
	}

	private getScaleScalar(scale: number) {
		return (scale / 100) * this.scaleFactor;
	}

	public setScaleFactor(scaleFactor: number) {
		this.scaleFactor = scaleFactor;
		this.mesh.scale.setScalar(this.getScaleScalar(this.settings.scale));
	}

	/**
	 * Returns `true` if the circle is visible and `false` otherwise.
	 *
	 * @returns `true` if the circle is visible and `false` otherwise
	 */
	public isVisible(): boolean {
		return this.mesh.visible;
	}

	/**
	 * Makes the circle visible
	 */
	public setVisible() {
		this.mesh.visible = true;
	}

	/**
	 * Makes the circle invisible
	 */
	public setInvisible() {
		this.mesh.visible = false;
	}

	public setPosition(x: number, y: number, z: number) {
		this.mesh.position.set(x, y, z);
	}

	public getObjects(): Object3D[] {
		return [this.mesh];
	}

	public update(): void {
		// nothing to update
	}

	public destroy(): void {
		this.geometry.dispose();
		this.material.dispose();
		this.settings.unsubscribeAll();
	}
}
