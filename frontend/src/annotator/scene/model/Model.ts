import { type Result } from "neverthrow";
import { type BufferGeometry, type Material, type Object3D } from "three";
import { type Observer } from "~events/Events";
import type { MutableArrayLike } from "~util/TypedArrays";
import { type SceneSubject } from "../SceneSubject";
import { type LoaderError } from "./loader/Loader";

export interface GeometryObject3D extends Object3D {
	geometry: BufferGeometry;
	material: Material | Material[];
}

export const MODEL_FIELD_ACCESS_ERROR_MESSAGE =
	"Please use initializeModel() before accessing this field.";

/**
 * A 3D-Model
 */
export interface Model extends SceneSubject {
	/**
	 *Initializes a model
	 *
	 * @param files the model files
	 * @param onProgress an optional {@link Observer} which tracks progress
	 */
	initializeModel(
		files: File[],
		onProgress?: Observer<number>
	): Promise<Result<undefined, LoaderError>>;

	/**
	 * The number of elements that can be annotated.
	 */
	getIndexCount(): number;

	/**
	 * The number of faces or points of this model.
	 */
	getModelSize(): number;

	translateBVHIndices(
		indices: MutableArrayLike<number>,
		inPlace?: true
	): MutableArrayLike<number>;
	translateBVHIndices(
		indices: ArrayLike<number>,
		inPlace: false
	): Uint32Array;

	getObject(): GeometryObject3D;
}
