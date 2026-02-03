/**
 * Modification of typescript's ArrayLike that allows mutation of
 * the underlying values at a given index.
 */
export interface MutableArrayLike<T> {
	readonly length: number;
	[index: number]: T;
}

/**
 * Union of the js number primitive TypedArray variants.
 */
export type NumberTypedArray<T extends ArrayBufferLike = ArrayBufferLike> =
	| Int8Array<T>
	| Uint8Array<T>
	| Uint8ClampedArray<T>
	| Int16Array<T>
	| Uint16Array<T>
	| Int32Array<T>
	| Uint32Array<T>
	| Float32Array<T>
	| Float64Array<T>;

/**
 * Canonical names of built-in js number primitive TypedArray constructors.
 * These names should be stable (not minified) across realms.
 */
export type NumberTypedArrayName =
	| "Int8Array"
	| "Uint8Array"
	| "Uint8ClampedArray"
	| "Int16Array"
	| "Uint16Array"
	| "Int32Array"
	| "Uint32Array"
	| "Float32Array"
	| "Float64Array";

/**
 * Union of the js bigint primitive TypedArray variants.
 */
export type BigIntTypedArray<T extends ArrayBufferLike = ArrayBufferLike> =
	| BigInt64Array<T>
	| BigUint64Array<T>;

/**
 * Canonical names of built-in js bigint primitive TypedArray constructors.
 * These names should be stable (not minified) across realms.
 */
export type BigIntTypedArrayName = "BigInt64Array" | "BigUint64Array";

/**
 * Union of the TypedArray variants.
 */
export type TypedArray<T extends ArrayBufferLike = ArrayBufferLike> =
	| NumberTypedArray<T>
	| BigIntTypedArray<T>;

/**
 * Canonical names of built-in TypedArray constructors.
 * These names should be stable (not minified) across realms.
 */
export type TypedArrayName = NumberTypedArrayName | BigIntTypedArrayName;

/**
 * Canonical name of the DataView constructor.
 */
export type DataViewName = "DataView";

/**
 * Union of the TypedArray variants and DataView.
 */
export type ArrayBufferView<T extends ArrayBufferLike = ArrayBufferLike> =
	| TypedArray<T>
	| DataView<T>;

/**
 * Canonical names of built-in `ArrayBufferView` constructors.
 */
export type ArrayBufferViewName = TypedArrayName | DataViewName;

/**
 * Constructor shape for TypedArrays.
 * @typeParam TypedArray - The concrete typed-array type (e.g. `Uint16Array`).
 */
export interface TypedArrayConstructor<T extends TypedArray> {
	new (length: number): T;
	new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
	readonly BYTES_PER_ELEMENT: number;
	readonly name: string;
}

/**
 * Constructor shape for `DataView`.
 */
export interface DataViewConstructor {
	new (
		buffer: ArrayBufferLike,
		byteOffset?: number,
		length?: number
	): DataView;
	readonly name: string;
}

/**
 * Union of constructors for any`ArrayBufferView`.
 */
export type ArrayBufferViewConstructor<T extends ArrayBufferView> =
	T extends DataView
		? DataViewConstructor
		: T extends TypedArray
		? TypedArrayConstructor<T>
		: never;

/**
 * A registry of all built-in JavaScript `ArrayBufferView` constructors, mapped by their canonical names.
 */
export const ARRAY_BUFFER_VIEW_CONSTRUCTORS: Record<
	ArrayBufferViewName,
	ArrayBufferViewConstructor<ArrayBufferView>
> = {
	Int8Array: Int8Array,
	Uint8Array: Uint8Array,
	Uint8ClampedArray: Uint8ClampedArray,
	Int16Array: Int16Array,
	Uint16Array: Uint16Array,
	Int32Array: Int32Array,
	Uint32Array: Uint32Array,
	Float32Array: Float32Array,
	Float64Array: Float64Array,
	BigInt64Array: BigInt64Array,
	BigUint64Array: BigUint64Array,
	DataView: DataView,
};

/**
 * Retrieves the constructor for a specific `ArrayBufferView` variant by its name.
 *
 * @param name - The canonical name of the view (e.g., `Float32Array` or `DataView`).
 * @returns The constructor, or `null` if the name is invalid.
 */
export function getArrayBufferViewConstructor(
	name: string | undefined
): ArrayBufferViewConstructor<ArrayBufferView> | null {
	if (name && name in ARRAY_BUFFER_VIEW_CONSTRUCTORS) {
		return ARRAY_BUFFER_VIEW_CONSTRUCTORS[name as TypedArrayName];
	}
	return null;
}

/**
 * Concats a list of UintArrays resulting in a single new Uint8Array.
 *
 * @param arrays - The arrays to concatenate.
 * @param total - The total byte size of all arrays if already known.
 * @returns The new concatenated Uint8Array.
 */
export function concatUint8Arrays(
	arrays: Uint8Array[],
	total?: number
): Uint8Array {
	const totalBytes = total
		? total
		: arrays.reduce((prev, current) => prev + current.byteLength, 0);
	const out = new Uint8Array(totalBytes);
	let offset = 0;
	for (const c of arrays) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

/**
 * Creates a `Uint8Array` view over a `DataView`'s underlying buffer.
 * This does not perform a copy.
 *
 * @param dataView The `DataView` to wrap.
 * @returns A `Uint8Array` that views the same memory as the `DataView`.
 */
export function toUint8Array(dataView: DataView) {
	return new Uint8Array(
		dataView.buffer,
		dataView.byteOffset,
		dataView.byteLength
	);
}

/**
 * Checks if two Uint8Arrays are equal by value.
 *
 * @param a - The first Uint8Array to compare.
 * @param b - The second Uint8Array to compare.
 * @returns `true` if both arrays contain the exact same bytes in the same order, otherwise `false`.
 */
export function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a === b) {
		return true;
	}

	if (a.byteLength !== b.byteLength) {
		return false;
	}

	for (let i = 0; i < a.byteLength; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}
