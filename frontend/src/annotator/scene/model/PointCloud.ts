import { err, ok, type Result } from "neverthrow";
import {
	type BufferGeometry,
	type Object3D,
	type Points,
	type PointsMaterial,
	type Mesh as ThreeMesh,
} from "three";
import type { CacheScope } from "~cache/index";
import { type Observer } from "~events/Events";
import { NumberSetting } from "~settings/Settings";
import { createSettingsManager } from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { disposeMaterials } from "~util/Three";
import type { MutableArrayLike } from "~util/TypedArrays";
import { PointCloudBuilder } from "./builder/PointCloudBuilder";
import { GenericLoader } from "./loader/GenericLoader";
import { type LoaderError } from "./loader/Loader";
import {
	MODEL_FIELD_ACCESS_ERROR_MESSAGE,
	type GeometryObject3D,
	type Model,
} from "./Model";

export const POINT_CLOUD_SETTINGS = {
	size: new NumberSetting("size", { initial: 0.005, min: 0, max: 5 }),
};

const settingsRegistry = new LocalStorageSettingsRegistry("pointCloud-tZ0mg");
settingsRegistry.registerMultiple(POINT_CLOUD_SETTINGS);

/**
 * A PointCloud Model
 */
export class PointCloud implements Model {
	private readonly settings;

	private readonly cacheScope: CacheScope;

	private readonly loader = new GenericLoader();

	// initialized in this.initializeModel()
	private points?: Points;
	private bvhMesh?: ThreeMesh;

	private index?: Uint32Array;

	constructor(scope: CacheScope) {
		this.settings = createSettingsManager(POINT_CLOUD_SETTINGS);

		this.cacheScope = scope;

		this.settings.onChange("size", ({ new: size }) => {
			this.setPointSize(size);
		});
	}

	public getBVHMesh(): ThreeMesh {
		if (!this.bvhMesh) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.bvhMesh;
	}

	public getPoints(): Points {
		if (!this.points) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.points;
	}

	public getObject(): GeometryObject3D {
		return this.getPoints();
	}

	private setPointSize(size: number) {
		if (!this.points) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		const material = this.points.material as PointsMaterial;
		material.size = size;
	}

	public async initializeModel(
		files: File[],
		onProgress?: Observer<number>
	): Promise<Result<undefined, LoaderError>> {
		if (files.length !== 1) {
			throw new Error("expected one file but got " + files.length);
		}

		let geometry: BufferGeometry | undefined;
		if (!(await PointCloudBuilder.isCached(this.cacheScope))) {
			const res = await this.loader.load(files, onProgress);
			if (res.isErr()) {
				return err(res.error);
			}

			geometry = res.value.geometry;
		}

		const builder = new PointCloudBuilder(this.cacheScope);
		const [pointCloud, bvhMesh] = await builder.build(geometry);
		this.bvhMesh = bvhMesh;
		this.index = bvhMesh.geometry.index!.array as Uint32Array;
		this.points = pointCloud;
		return ok(undefined);
	}

	/**
	 * Returns index count of vertices in the point cloud
	 *
	 * @returns index count
	 */
	public getIndexCount(): number {
		return this.getModelSize();
	}

	public getModelSize(): number {
		const positionAttr = this.getPoints().geometry.getAttribute("position");
		return positionAttr.count;
	}

	public translateBVHIndices(
		indices: MutableArrayLike<number>,
		inPlace?: true
	): MutableArrayLike<number>;
	public translateBVHIndices(
		indices: ArrayLike<number>,
		inPlace: false
	): Uint32Array;
	public translateBVHIndices(
		indices: ArrayLike<number> | MutableArrayLike<number>,
		inPlace = true
	) {
		const out = inPlace
			? (indices as MutableArrayLike<number>)
			: new Uint32Array(indices.length);

		const index = this.index!;
		for (let i = 0; i < out.length; i++) {
			out[i] = index[indices[i]];
		}
		return out;
	}

	public getObjects(): Object3D[] {
		return [this.getPoints()];
	}

	/**
	 * Updates the point cloud
	 */
	public update(): void {
		// nothing to do
	}

	/**
	 * Disposes:
	 * 	- the mesh geometry
	 *  - the mesh bounds tree
	 *  - the mesh material
	 *  - the mesh texture
	 */
	public destroy(): void {
		this.points?.geometry.dispose();
		disposeMaterials(this.points?.material);

		this.bvhMesh?.geometry.dispose();
		this.bvhMesh?.geometry.disposeBoundsTree();
		disposeMaterials(this.bvhMesh?.material);

		this.settings.unsubscribeAll();
	}
}
