import {
	createBinaryCacheCodecFromClass,
	type Cacheable,
	// TODO: Fix by using https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/no-undefined-types.md
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	type CacheableClass,
	type CacheCodec,
} from "~cache/index";
import type { TypedArray, TypedArrayConstructor } from "~util/TypedArrays";
import {
	createWorkerCodecFromClass,
	type WorkerCodec,
	type WorkerTransferable,
	// TODO: Fix using https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/no-undefined-types.md
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	type WorkerTransferableClass,
} from "~workers/index";

/**
 * Wire/DTO format for CategoryBuffer.
 * Used for both Cache persistence and Worker transfer.
 */
interface CategoryBufferDTO {
	/** Total number of elements the buffer can hold. */
	maxElements: number;
	/** Number of elements currently in Category A. */
	sizeA: number;
	/** Number of elements currently in Category B. */
	sizeB: number;
	/** The underlying buffer view. */
	data: TypedArray;
}

/**
 * A high-performance, memory-efficient buffer for separating numeric
 * values into two categories ("A" and "B").
 *
 * This class implements both `Cacheable` and `WorkerTransferable`, allowing
 * it to be persisted to disk or sent between threads without buffer serialization.
 */
export class CategoryBuffer<
	T extends TypedArray,
	V extends number | bigint = number
> implements
		Cacheable<CategoryBufferDTO>,
		WorkerTransferable<CategoryBufferDTO>
{
	/**
	 * Total maximum number of elements this buffer can hold
	 * across both categories.
	 */
	public readonly maxElements: number;

	private readonly _array: T;

	private _sizeA: number;
	private _sizeB: number;

	private constructor(
		maxElements: number,
		array: T,
		sizeA: number,
		sizeB: number
	) {
		this.maxElements = maxElements;
		this._array = array;
		this._sizeA = sizeA;
		this._sizeB = sizeB;
	}

	/**
	 * Creates a new, empty CategoryBuffer.
	 *
	 * @example
	 * ```ts
	 * // Standard number buffer
	 * const buf = CategoryBuffer.create(Float32Array, 1000);
	 * buf.pushA(1.5);
	 *
	 * // BigInt buffer (requires explicit value type)
	 * const bigBuf = CategoryBuffer.create<BigInt64Array, bigint>(BigInt64Array, 1000);
	 * bigBuf.pushA(100n);
	 * ```
	 */
	public static create<
		T extends TypedArray,
		V extends number | bigint = number
	>(
		typedArrayConstructor: TypedArrayConstructor<T>,
		maxElements: number
	): CategoryBuffer<T, V> {
		if (!Number.isInteger(maxElements) || maxElements < 0) {
			throw new RangeError(
				`CategoryBuffer: maxElements '${maxElements}' is not a non-negative integer.`
			);
		}

		const array = new typedArrayConstructor(maxElements);
		return new CategoryBuffer<T, V>(maxElements, array, 0, 0);
	}

	/**
	 * Total bytes allocated for the underlying data buffer.
	 */
	get bytesAllocated(): number {
		return this._array.buffer.byteLength;
	}

	/**
	 * Total maximum number of elements this buffer can hold.
	 * Alias for `maxElements`.
	 */
	get capacity(): number {
		return this.maxElements;
	}

	/**
	 * The number of elements currently stored in Category A.
	 */
	get sizeA(): number {
		return this._sizeA;
	}

	/**
	 * The number of elements currently stored in Category B.
	 */
	get sizeB(): number {
		return this._sizeB;
	}

	/**
	 * The total number of elements currently stored in the buffer
	 * (Category A + Category B).
	 */
	get sizeTotal(): number {
		return this._sizeA + this._sizeB;
	}

	/**
	 * The number of remaining slots available in the buffer.
	 */
	get remainingCapacity(): number {
		return this.maxElements - this._sizeA - this._sizeB;
	}

	/**
	 * Appends a value to Category A.
	 * This is an O(1) operation.
	 *
	 * @param value - The numeric value to add.
	 * @throws {RangeError} If the buffer is full.
	 */
	public pushA(value: V): void {
		if (this._sizeA + this._sizeB >= this.maxElements) {
			throw new RangeError("CategoryBuffer: Buffer is full.");
		}
		this._array[this._sizeA] = value;
		this._sizeA++;
	}

	/**
	 * Appends a value to Category B.
	 * This is an O(1) operation.
	 *
	 * @param value - The numeric value to add.
	 * @throws {RangeError} If the buffer is full.
	 */
	public pushB(value: V): void {
		if (this._sizeA + this._sizeB >= this.maxElements) {
			throw new RangeError("CategoryBuffer: Buffer is full.");
		}
		this._array[this.maxElements - 1 - this._sizeB] = value;
		this._sizeB++;
	}

	/**
	 * Returns a zero-copy `TypedArray` view of all elements
	 * currently in Category A, in insertion order.
	 *
	 * The returned view is valid until the next call to `clear()`.
	 * The view's length is fixed upon creation. Subsequent calls to
	 * `pushA()` will not be reflected in a previously-obtained view.
	 *
	 * Modifying the view will modify the underlying buffer.
	 *
	 * This is an O(1) operation (creates a view, does not copy data).
	 *
	 * @returns A `TypedArray` view of Category A's data.
	 */
	public getCategoryAView(): T {
		return this._array.subarray(0, this._sizeA) as T;
	}

	/**
	 * Returns a zero-copy `TypedArray` view of all elements
	 * currently in Category B.
	 *
	 * **Note:** Elements appear in **reverse insertion order**
	 * (e.g., `pushB(1)`, `pushB(2)` results in a view `[2, 1]`).
	 *
	 * The returned view is valid until the next call to `clear()`.
	 * The view's length is fixed upon creation. Subsequent calls to
	 * `pushB()` will not be reflected in a previously-obtained view.
	 *
	 * Modifying the view will modify the underlying buffer.
	 *
	 * This is an O(1) operation (creates a view, does not copy data).
	 *
	 * @returns A `TypedArray` view of Category B's data.
	 */
	public getCategoryBView(): T {
		return this._array.subarray(
			this.maxElements - this._sizeB,
			this.maxElements
		) as T;
	}

	/**
	 * Resets the buffer to an empty state.
	 * This is an O(1) operation (it just resets the size counters).
	 * It does **not** zero the underlying memory.
	 */
	public clear(): void {
		this._sizeA = 0;
		this._sizeB = 0;
	}

	/** See {@link CacheableClass}. */
	static readonly CACHE_CODEC_CONFIG = {
		id: "CategoryBuffer",
		version: 1,
	};

	/** @inheritdoc */
	public dehydrate(): CategoryBufferDTO {
		return {
			maxElements: this.maxElements,
			sizeA: this._sizeA,
			sizeB: this._sizeB,
			data: this._array,
		};
	}

	/** @inheritdoc */
	public pack(): {
		payload: CategoryBufferDTO;
		transfer: Transferable[];
	} {
		return {
			payload: this.dehydrate(),
			transfer: [this._array.buffer],
		};
	}

	/** See {@link CacheableClass}. */
	public static hydrate<
		T extends TypedArray,
		V extends number | bigint = number
	>(dto: CategoryBufferDTO): CategoryBuffer<T, V> {
		return new CategoryBuffer<T, V>(
			dto.maxElements,
			dto.data as T,
			dto.sizeA,
			dto.sizeB
		);
	}

	/** See {@link WorkerTransferableClass}. */
	public static unpack<
		T extends TypedArray,
		V extends number | bigint = number
	>(dto: CategoryBufferDTO): CategoryBuffer<T, V> {
		return CategoryBuffer.hydrate<T, V>(dto);
	}
}

const baseCacheCodec = createBinaryCacheCodecFromClass(CategoryBuffer);
const baseWorkerCodec = createWorkerCodecFromClass(CategoryBuffer);

/**
 * Gets a strongly-typed Cache Codec for a specific CategoryBuffer type.
 *
 * @typeParam T - The TypedArray type.
 * @typeParam V - The value type (number | bigint), defaults to number.
 */
export function getCategoryBufferCacheCodec<
	T extends TypedArray,
	V extends number | bigint = number
>() {
	return baseCacheCodec as CacheCodec<CategoryBuffer<T, V>>;
}

/**
 * Gets a strongly-typed Worker Codec for a specific CategoryBuffer type.
 *
 * @typeParam T - The TypedArray type.
 * @typeParam V - The value type (number | bigint), defaults to number.
 */
export function getCategoryBufferWorkerCodec<
	T extends TypedArray,
	V extends number | bigint = number
>() {
	return baseWorkerCodec as WorkerCodec<
		CategoryBuffer<T, V>,
		CategoryBufferDTO
	>;
}
