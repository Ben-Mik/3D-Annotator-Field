import {
	MeshStandardMaterial,
	SphereGeometry,
	Mesh as ThreeMesh,
	Sphere as ThreeSphere,
	type Object3D,
	type Vector3,
} from "three";
import { getHeightAt } from "~annotator/scene/Camera";
import type { Model } from "~annotator/scene/model/Model";
import type { Scene } from "~annotator/scene/Scene";
import { type SceneSubject } from "~annotator/scene/SceneSubject";
import {
	ColorSetting,
	NumberSetting,
	PercentageSetting,
} from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";

export function createDefaultSphereScaleSetting() {
	return new PercentageSetting("scale", 1, 300);
}

export type SphereSettings = ReturnType<typeof createDefaultSphereSettings>;

export function createDefaultSphereSettings() {
	return {
		widthSegments: new NumberSetting("widthSegments", {
			initial: 32,
			min: 3,
			max: 1024,
		}),
		heightSegments: new NumberSetting("heightSegments", {
			initial: 16,
			min: 2,
			max: 1024,
		}),
		opacity: new PercentageSetting("opacity", 50),
		color: new ColorSetting("color", 0xec407a),
		emissiveColor: new ColorSetting("emissiveColor", 0xec407a),
		emissiveIntensity: new PercentageSetting("emissiveIntensity", 50),
	};
}

/**
 * A Sphere used by tools to visualize the brush position and size
 */
export class Sphere implements SceneSubject {
	private readonly settings;
	private readonly mesh: ThreeMesh;

	private geometry: SphereGeometry;
	private material: MeshStandardMaterial;
	private readonly scaleFactor: number;

	/**
	 * Constructs an new instance of the Sphere
	 *
	 * @param settings optional default options
	 */
	constructor(
		scaleSetting: PercentageSetting,
		scaleFactor = 1,
		settings?: SphereSettings
	) {
		const mergedSphereSettings = {
			...createDefaultSphereSettings(),
			...settings,
		};

		this.settings = createSettingsManager({
			scale: scaleSetting,
			sphere: mergedSphereSettings,
		});

		this.scaleFactor = scaleFactor;

		this.settings.onChange("scale", ({ new: scale }) => {
			this.mesh.scale.setScalar(this.getScaleScalar(scale));
		});

		this.settings.sphere.onChange(
			["widthSegments", "heightSegments"],
			() => {
				this.resetGeometry();
			}
		);

		this.settings.sphere.onChange(
			["color", "opacity", "emissiveColor", "emissiveIntensity"],
			() => {
				this.resetMaterial();
			}
		);

		this.geometry = this.createGeometry();
		this.material = this.createMaterial();

		this.mesh = new ThreeMesh(this.geometry, this.material);
		this.mesh.scale.setScalar(this.getScaleScalar(this.settings.scale));
		this.setInvisible();
	}

	private createGeometry() {
		return new SphereGeometry(
			1,
			this.settings.sphere.widthSegments,
			this.settings.sphere.heightSegments
		);
	}

	private createMaterial() {
		return new MeshStandardMaterial({
			transparent: true,
			premultipliedAlpha: true,
			color: this.settings.sphere.color,
			opacity: PercentageSetting.toNumber(this.settings.sphere.opacity),
			emissive: this.settings.sphere.emissiveColor,
			emissiveIntensity: PercentageSetting.toNumber(
				this.settings.sphere.emissiveIntensity
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

	/**
	 * Returns the radius of the sphere
	 *
	 * @returns the radius
	 */
	public getEffectiveRadius(): number {
		return (
			this.geometry.parameters.radius *
			this.getScaleScalar(this.settings.scale)
		);
	}

	/**
	 * Returns `true` if the sphere is visible and `false` otherwise.
	 *
	 * @returns `true` if the sphere is visible and `false` otherwise
	 */
	public isVisible(): boolean {
		return this.mesh.visible;
	}

	/**
	 * Makes the sphere visible
	 */
	public setVisible() {
		this.mesh.visible = true;
	}

	/**
	 * Makes the sphere invisible
	 */
	public setInvisible() {
		this.mesh.visible = false;
	}

	/**
	 * Returns the sphere position
	 *
	 * @returns the position
	 */
	public getPosition(): Vector3 {
		return this.mesh.position;
	}

	/**
	 * Sets the sphere position
	 * @param position the position
	 */
	public setPosition(position: Vector3) {
		this.mesh.position.copy(position);
	}

	/**
	 * Creates a new sphere with the same position and radius as this sphere
	 *
	 * @returns a sphere
	 */
	public createThreeSphere(): ThreeSphere {
		const sphere = new ThreeSphere();
		sphere.center.copy(this.mesh.position);
		sphere.radius = this.getEffectiveRadius();
		return sphere;
	}

	public getObjects(): Object3D[] {
		return [this.mesh];
	}

	public update(): void {
		// noting to update
	}

	/**
	 * Disposes this sphere
	 */
	public destroy(): void {
		this.geometry.dispose();
		this.material.dispose();
		this.settings.unsubscribeAll();
	}

	/**
	 * A helper method to calculate a scale factor for a Sphere that uses the
	 * scene height and initial camera position as reference.
	 *
	 * Example:
	 *
	 * If the value returned by this function is used to initialize a Sphere,
	 * a scale setting value of 10% will make the Sphere diameter be exactly
	 * 10% of the scene height in its original camera position.
	 */
	public static calculateSceneHeightScaleFactor<T extends Model>(
		scene: Scene<T>
	): number {
		const distance = scene.getCameraControls().getPerspectiveDistance();
		return getHeightAt(scene.camera, distance);
	}
}
