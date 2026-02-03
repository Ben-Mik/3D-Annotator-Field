import { err, ok, type Result } from "neverthrow";
import {
	type BufferGeometry,
	type Object3D,
	type Texture,
	type Mesh as ThreeMesh,
} from "three";
import type { CacheScope } from "~cache/index";
import type { Observer } from "~events/Events";
import { disposeMaterials } from "~util/Three";
import type { MutableArrayLike } from "~util/TypedArrays";
import { GenericLoader } from "./loader/GenericLoader";
import type { LoaderError } from "./loader/Loader";
import {
	MODEL_FIELD_ACCESS_ERROR_MESSAGE,
	type GeometryObject3D,
	type Model,
} from "./Model";

export abstract class MeshTypeModel implements Model {
	private readonly loader = new GenericLoader();

	protected readonly cacheScope: CacheScope;

	private mesh?: ThreeMesh;
	private indexCount?: number;
	private triangleToFaceIndexLUT?: Uint32Array;

	private texture?: Texture;

	constructor(scope: CacheScope) {
		this.cacheScope = scope;
	}

	public async initializeModel(
		files: File[],
		onProgress?: Observer<number>
	): Promise<Result<undefined, LoaderError>> {
		const skipModel = await this.isCached();

		const res = await this.loader.load(files, onProgress, skipModel);
		if (res.isErr()) {
			return err(res.error);
		}
		const { geometry, texture } = res.value;
		this.texture = texture;

		const [mesh, indexCount] = await this.onModelLoaded(geometry, texture);

		this.mesh = mesh;
		this.indexCount = indexCount;
		this.triangleToFaceIndexLUT = this.buildLUT(mesh.geometry);

		return ok(undefined);
	}

	private buildLUT(geometry: BufferGeometry): Uint32Array {
		const indexAttribute = geometry.index;
		if (!indexAttribute) {
			throw new Error("MeshTypeModel: Geometry has no index attribute.");
		}

		const indexArray = indexAttribute.array as Uint32Array;
		const faceCount = (indexArray.length / 3) | 0;
		const lookUpTable = new Uint32Array(faceCount);
		for (let t = 0; t < faceCount; t++) {
			lookUpTable[t] = (indexArray[3 * t] / 3) | 0;
		}
		return lookUpTable;
	}

	protected abstract isCached(): Promise<boolean>;

	protected abstract onModelLoaded(
		geometry?: BufferGeometry,
		texture?: Texture
	): Promise<[ThreeMesh, number]>;

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

		const lookUpTable = this.triangleToFaceIndexLUT!;
		for (let i = 0; i < out.length; i++) {
			out[i] = lookUpTable[indices[i]];
		}
		return out;
	}

	public getIndexCount(): number {
		if (this.indexCount === undefined) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}
		return this.indexCount;
	}

	public getModelSize(): number {
		return (this.getMesh().geometry.getAttribute("position").count / 3) | 0;
	}

	public getMesh(): ThreeMesh {
		if (!this.mesh) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.mesh;
	}

	public getObject(): GeometryObject3D {
		return this.getMesh();
	}

	public getObjects(): Object3D[] {
		return [this.getMesh()];
	}

	public update(): void {
		// nothing to do
	}

	public destroy() {
		this.mesh?.geometry.dispose();
		this.mesh?.geometry.disposeBoundsTree();
		disposeMaterials(this.mesh?.material);
		this.texture?.dispose();
		this.triangleToFaceIndexLUT = undefined;
	}
}
