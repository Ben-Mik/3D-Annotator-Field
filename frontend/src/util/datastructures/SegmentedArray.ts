import {
	createBinaryCacheCodecFromClass,
	type BinaryCacheCodec,
	type Cacheable,
} from "~cache/index";
import type {
	NumberTypedArray,
	TypedArrayConstructor,
} from "~util/TypedArrays";
import {
	createWorkerCodecFromClass,
	type WorkerCodec,
	type WorkerTransferable,
} from "~workers/index";

const UINT32_MAX = 0xffff_ffff; // 4_294_967_295

const DEFAULT_GROWTH_FACTOR = 2;
const MAX_GROWTH_FACTOR = 16;

/**
 * Wire/DTO format for SegmentedArray.
 */
export interface SegmentedArrayDTO {
	itemLength: number;
	maxSegments: number;
	sizeSegments: number; // _closedSegments
	sizeElements: number; // _writePosition
	isResizable: boolean;
	maxBytes: number;
	growthFactor: number;
	data: NumberTypedArray;
	offsets: Uint32Array;
}

/**
 * Read/write view of a contiguous sequence of fixed-length **items**
 * (each item is `itemLength` elements) inside a TypedArray.
 * Returned by {@link SegmentedArray.segmentView}.
 *
 * This class does **not** copy data on instantiation; it references the parent buffer.
 *
 * @typeParam TypedArray - The underlying numeric TypedArray type.
 */
class SegmentView<TypedArray extends NumberTypedArray> {
	/** Number of items in this view. */
	public readonly length: number;

	private readonly _data: TypedArray;
	private readonly _base: number;
	private readonly _itemLength: number;

	/**
	 * Creates a SegmentView.
	 * @param data - The parent typed array.
	 * @param base - The starting element index of this view in the parent.
	 * @param length - The number of *items* in this view.
	 * @param itemLength - The number of *elements* per item.
	 */
	constructor(
		data: TypedArray,
		base: number,
		length: number,
		itemLength: number
	) {
		this.length = length;
		this._data = data;
		this._base = base;
		this._itemLength = itemLength;
	}

	/**
	 * Read one item by index, creating a freshly allocated `number[]`.
	 *
	 * @param item - Item index in `[0, length)`.
	 * @returns A freshly allocated `number[]` of length `itemLength`.
	 * @throws {RangeError} If `item` is out of bounds.
	 */
	getItemCopy(item: number): number[] {
		if (item < 0 || item >= this.length) {
			throw new RangeError(
				`SegmentedArray, SegmentView: Item index '${item}' is out of bounds for length '${this.length}'.`
			);
		}

		const offset = this._base + item * this._itemLength;
		const out = new Array<number>(this._itemLength);
		for (let k = 0; k < this._itemLength; k++) {
			out[k] = this._data[offset + k];
		}
		return out;
	}

	/**
	 * Read one item by index, creating a zero-copy view of the parent buffer.
	 *
	 * @param item - Item index in `[0, length)`.
	 * @returns A zero-copy view (numeric typed array) of length `itemLength`.
	 * @throws {RangeError} If `item` is out of bounds.
	 */
	getItemView(item: number): TypedArray {
		if (item < 0 || item >= this.length) {
			throw new RangeError(
				`SegmentedArray, SegmentView: Item index '${item}' is out of bounds for length '${this.length}'.`
			);
		}

		const offset = this._base + item * this._itemLength;
		return this._data.subarray(
			offset,
			offset + this._itemLength
		) as TypedArray;
	}

	/**
	 * Overwrite one item in-place.
	 *
	 * @param item - Item index in `[0, length)`.
	 * @param itemData - Array-like of length `itemLength` with element values.
	 * @throws {RangeError} If `item` is out of bounds or `itemData.length` mismatches.
	 */
	setItem(item: number, itemData: ArrayLike<number>): void {
		if (item < 0 || item >= this.length) {
			throw new RangeError(
				`SegmentedArray, SegmentView: Item index '${item}' is out of bounds for length '${this.length}'.`
			);
		}

		if (itemData.length !== this._itemLength) {
			throw new RangeError(
				`SegmentedArray, SegmentView: Item length '${itemData.length}' does not match expected item length of '${this._itemLength}'.`
			);
		}

		const offset = this._base + item * this._itemLength;
		for (let k = 0; k < this._itemLength; k++) {
			this._data[offset + k] = itemData[k];
		}
	}

	/**
	 * Iterate over items as freshly allocated `number[]` arrays.
	 * Convenience method; incurs per-item allocation.
	 */
	*itemCopies(): IterableIterator<number[]> {
		for (let item = 0; item < this.length; item++) {
			yield this.getItemCopy(item);
		}
	}

	/**
	 * Iterate over items as zero-copy views referencing the parent buffer.
	 */
	*itemViews(): IterableIterator<TypedArray> {
		for (let item = 0; item < this.length; item++) {
			yield this.getItemView(item);
		}
	}
}

/**
 * A readonly instance of {@link SegmentedArray}.
 *
 * Methods that modify the underlying data are hidden at the type level.
 * Methods may throw an error when used anyway.
 */
export type ReadonlySegmentedArray<TypedArray extends NumberTypedArray> = Omit<
	SegmentedArray<TypedArray>,
	| "beginSegment"
	| "pushItem"
	| "pushItemData"
	| "endSegment"
	| "pushSegment"
	| "pushFrom"
	| "trim"
>;

/**
 * A compact, append-only collection of many **segments**, where each segment
 * contains a variable number of fixed-length **items** (each item consists of
 * `itemLength` **elements**), all packed into a single TypedArray.
 *
 * ### Capacity & limits
 * - **Elements ceiling (offsets):** Offsets use `Uint32Array`, so the total number of
 *   written **elements** across all segments must be ≤ **4,294,967,295** (`2^32 - 1`).
 *   Equivalently, `sizeItems * itemLength <= 4,294,967,295`.
 * - **Resizable buffer max:** If you enable the resizable buffer, you provide `maxItems`.
 *   This sets `maxElements = maxItems * itemLength` and `maxBytes = maxElements * BYTES_PER_ELEMENT`.
 *   `maxBytes` must be a non-negative finite number. Engines also impose practical upper
 *   bounds; as a rule of thumb keep `maxBytes ≤ Number.MAX_SAFE_INTEGER` (~9.0e15 bytes)
 *   and choose realistic values for your environment.
 *
 * ### Key properties
 * - Sequential build: call {@link beginSegment}, then any number of
 *   {@link pushItem} / {@link pushItemData}, then {@link endSegment}.
 * - Random access: segment-level zero-copy view via {@link segmentDataView}
 *   and per-item access via {@link segmentView}.
 * - Iteration helpers: per-segment views via {@link segmentDataViews} /
 *   {@link segmentViews}, and per-item views via {@link segmentItemViews}.
 * - Copy variants on demand: {@link segmentDataCopy}, {@link segmentDataCopies},
 *   {@link getItem}, {@link segmentItemCopies}.
 * - Optional **Resizable ArrayBuffer** to keep views valid across growth.
 *
 * @example
 * ```ts
 * // 300k segments, items are 3 elements each (e.g. x,y,z),
 * // stored as Uint16 with a resizable buffer.
 * const arr = SegmentedArray.create(Uint16Array, 300_000, 3, {
 *   initialItemCapacity: 1_000_000,
 *   resizable: { maxItems: 10_000_000 },
 * });
 *
 * arr.beginSegment();
 * arr.pushItem([1, 2, 3]);
 * arr.pushItemData(new Uint16Array([4,5,6, 7,8,9]));
 * arr.endSegment();
 *
 * for (const dataView of arr) {   // default: segmentDataViews()
 *   // dataView is a zero-copy typed-array view of one finalized segment
 * }
 * ```
 *
 * @typeParam TypedArray - The underlying numeric TypedArray type (e.g. `Uint16Array`).
 */
export class SegmentedArray<TypedArray extends NumberTypedArray>
	implements
		Cacheable<SegmentedArrayDTO>,
		WorkerTransferable<SegmentedArrayDTO>
{
	/** Total number of segments; fixed at construction. */
	public readonly maxSegments: number;

	/** Number of elements that compose one item in any segment. */
	public readonly itemLength: number;

	private _buffer: ArrayBufferLike;
	private readonly _isResizable: boolean;
	private readonly _maxBytes: number;
	private readonly _growthFactor: number;

	private readonly _constructor: TypedArrayConstructor<TypedArray>;
	private _data: TypedArray;

	private readonly _offsets: Uint32Array;

	private _writePosition = 0;
	private _inSegment = false;
	private _closedSegments = 0;

	private constructor(
		typedArrayConstructor: TypedArrayConstructor<TypedArray>,
		itemLength: number,
		maxSegments: number,
		data: TypedArray,
		offsets: Uint32Array,
		writePosition: number,
		closedSegments: number,
		isResizable: boolean,
		maxBytes: number,
		growthFactor: number
	) {
		this._constructor = typedArrayConstructor;
		this.itemLength = itemLength;
		this.maxSegments = maxSegments;

		this._data = data;
		this._buffer = data.buffer;
		this._offsets = offsets;

		this._writePosition = writePosition;
		this._closedSegments = closedSegments;

		this._isResizable = isResizable;
		this._maxBytes = maxBytes;
		this._growthFactor = growthFactor;
	}

	/**
	 * Creates a new SegmentedArray.
	 *
	 * @param typedArrayConstructor - Concrete TypedArray constructor (e.g. `Uint16Array`).
	 * @param itemLength - Number of elements per item, `>= 1`.
	 * @param maxSegments - Total number of segments to be written.
	 * @param options - Optional capacity and buffer configuration.
	 * @param options.initialItemCapacity - Initial capacity as **items** (not segments).
	 * Actual underlying capacity is `initialItemCapacity * itemLength` **elements**.
	 * @param options.resizable - If provided, uses a **Resizable ArrayBuffer**.
	 * `maxItems` defines the hard upper bound (in items) up to which the buffer may grow.
	 * @param options.growthFactor - Geometric growth multiplier used when expanding capacity.
	 * Applies to both classic and resizable buffers. Must be ≥ 1.
	 * Values above an internal cap are clamped (default cap: 8). Default: 2.
	 *
	 * @throws {RangeError} If arguments are invalid.
	 */
	public static create<T extends NumberTypedArray>(
		typedArrayConstructor: TypedArrayConstructor<T>,
		itemLength: number,
		maxSegments: number,
		options?: {
			initialItemCapacity?: number;
			resizable?: { maxItems: number };
			growthFactor?: number;
		}
	): SegmentedArray<T> {
		if (!Number.isInteger(maxSegments) || maxSegments < 0) {
			throw new RangeError(
				`SegmentedArray: maxSegments '${maxSegments}' is not an integer >= 0.`
			);
		}

		if (!Number.isInteger(itemLength) || itemLength < 1) {
			throw new RangeError(
				`SegmentedArray: itemLength '${itemLength}' is not an integer >= 1.`
			);
		}

		const growthFactor =
			options?.growthFactor &&
			options.growthFactor >= 1 &&
			Number.isFinite(options.growthFactor)
				? Math.min(options.growthFactor, MAX_GROWTH_FACTOR)
				: DEFAULT_GROWTH_FACTOR;

		const bytesPerElement = typedArrayConstructor.BYTES_PER_ELEMENT;
		const initialItems = Math.max(0, options?.initialItemCapacity ?? 0);
		const initialElements = initialItems * itemLength;
		const initialBytes = initialElements * bytesPerElement;

		let buffer: ArrayBuffer;
		let isResizable = false;
		let maxBytes = 0;

		if (options?.resizable) {
			const maxItems = Math.max(
				initialItems,
				Math.floor(options.resizable.maxItems)
			);
			const maxElements = maxItems * itemLength;
			maxBytes = maxElements * bytesPerElement;

			if (!Number.isFinite(maxBytes) || maxBytes < 0) {
				throw new RangeError(
					"SegmentedArray: maxByteLength must be a non-negative finite integer"
				);
			}

			// create a resizable buffer
			buffer = new ArrayBuffer(initialBytes, {
				maxByteLength: maxBytes,
			});
			isResizable = true;
		} else {
			// fixed-size buffer
			buffer = new ArrayBuffer(initialBytes);
		}

		const data = new typedArrayConstructor(buffer);
		const offsets = new Uint32Array(maxSegments + 1);
		offsets[0] = 0;

		return new SegmentedArray<T>(
			typedArrayConstructor,
			itemLength,
			maxSegments,
			data,
			offsets,
			0, // writePosition
			0, // closedSegments
			isResizable,
			maxBytes,
			growthFactor
		);
	}

	/**
	 * Geometric growth multiplier in use (≥ 1).
	 * */
	get growthFactor(): number {
		return this._growthFactor;
	}

	/**
	 * Total allocated bytes (data + offsets).
	 */
	get bytesAllocated(): number {
		return this._data.byteLength + this._offsets.byteLength;
	}

	/**
	 * Number of segments that have been finalized with {@link endSegment}.
	 */
	get sizeSegments(): number {
		return this._closedSegments;
	}

	/**
	 * Total number of underlying elements written so far.
	 */
	get sizeElements(): number {
		return this._writePosition;
	}

	/**
	 * Total number of logical items written so far.
	 * Equivalent to `Math.floor(sizeElements / itemLength)`.
	 */
	get sizeItems(): number {
		return Math.floor(this._writePosition / this.itemLength);
	}

	/**
	 * Begin appending items to the next segment.
	 * Must be paired with a subsequent call to {@link endSegment}.
	 *
	 * @throws {Error} If already in a segment.
	 * @throws {RangeError} If all segments have already been written.
	 */
	public beginSegment(): void {
		if (this._inSegment) {
			throw new Error(
				"SegmentedArray: Already in a segment; call endSegment() first."
			);
		}

		if (this._closedSegments >= this.maxSegments) {
			throw new RangeError(
				"SegmentedArray: All segments already written"
			);
		}

		this._inSegment = true;
		this._offsets[this._closedSegments] = this._writePosition;
	}

	/**
	 * Append one item into the current segment.
	 *
	 * @param itemValue - Array-like of length `itemLength` with element values.
	 * @throws {Error} If {@link beginSegment} has not been called.
	 * @throws {RangeError} If `itemValue.length !== itemLength`.
	 */
	public pushItem(itemValue: ArrayLike<number>): void {
		if (!this._inSegment) {
			throw new Error("SegmentedArray: Call beginSegment() first.");
		}

		if (itemValue.length !== this.itemLength) {
			throw new RangeError(
				`SegmentedArray: Item length '${itemValue.length}' does not match expected item length of '${this.itemLength}'.`
			);
		}

		this._ensureCapacity(this._writePosition + this.itemLength);
		for (let k = 0; k < this.itemLength; k++) {
			this._data[this._writePosition++] = itemValue[k];
		}
	}

	/**
	 * Append many elements (flattened items) in one call.
	 *
	 * Useful when you already have interleaved item data for the current segment.
	 * When using a resizable buffer, larger blocks can reduce the number of resizes.
	 *
	 * @param data - Array-like of elements; its length must be a multiple of `itemLength`.
	 * @throws {Error} If {@link beginSegment} has not been called.
	 * @throws {RangeError} If `data.length % itemLength !== 0`.
	 */
	public pushItemData(data: ArrayLike<number>): void {
		if (!this._inSegment) {
			throw new Error("SegmentedArray: Call beginSegment() first");
		}

		if (data.length % this.itemLength !== 0) {
			throw new RangeError(
				"SegmentedArray: Segment Data length must be a multiple of itemLength."
			);
		}

		const positionAfterWrite = this._writePosition + data.length;
		this._ensureCapacity(positionAfterWrite);
		this._data.set(data, this._writePosition);
		this._writePosition = positionAfterWrite;
	}

	/**
	 * Finalize the current segment.
	 * After this call, segment data becomes readable; writing continues in a new segment.
	 *
	 * @throws {Error} If {@link beginSegment} has not been called.
	 */
	public endSegment(): void {
		if (!this._inSegment) {
			throw new Error("SegmentedArray: beginSegment() not called.");
		}

		this._offsets[this._closedSegments + 1] = this._writePosition;
		this._closedSegments++;
		this._inSegment = false;
	}

	/**
	 * Append a full segment in one call.
	 *
	 * - `data.length` must be a multiple of `itemLength` (0 is allowed - produces an empty segment).
	 * - Operation is **atomic**: on failure (e.g., resizable buffer exceeds its cap),
	 *   the structure is left unchanged (no open segment).
	 *
	 * @param data - Flattened elements for all items in the segment.
	 * @throws {RangeError} If `data.length % itemLength !== 0` or segment limit reached.
	 * @throws {Error} Propagates underlying allocation/resize errors; state is rolled back.
	 */
	public pushSegment(data: ArrayLike<number>): void {
		if (data.length % this.itemLength !== 0) {
			throw new RangeError(
				"SegmentedArray: Segment data length must be a multiple of itemLength."
			);
		}

		const prevWrite = this._writePosition;

		this.beginSegment();
		try {
			this.pushItemData(data);
			this.endSegment();
		} catch (err) {
			this._inSegment = false;
			this._writePosition = prevWrite;
			this._offsets[this._closedSegments] = prevWrite;
			throw err;
		}
	}

	/**
	 * Append all finalized segments from `source` to this instance.
	 *
	 * - `source` must use the **same** TypedArray constructor and the same `itemLength`.
	 * - Neither `this` nor `source` may have an open segment in progress.
	 * - Segment boundaries (including empty segments) are preserved in order.
	 *
	 * Complexity
	 * - **Time:** O(source.totalElements) — one typed-array copy per source segment.
	 * - **Extra space:** O(1) — grows this buffer as needed; no intermediate allocations.
	 *
	 * @param source - The `SegmentedArray` whose finalized segments will be appended.
	 * @throws {Error} If `this` or `source` has an open segment.
	 * @throws {Error} If TypedArray constructors or `itemLength` differ
	 * @throws {RangeError} If destination does not have enough remaining segment slots.
	 * @throws {RangeError} If required capacity would exceed the resizable buffer limit.
	 */
	public pushFrom(source: SegmentedArray<TypedArray>): void {
		if (this._inSegment) {
			throw new Error(
				"SegmentedArray.pushFrom: Destination has an open segment."
			);
		}
		if (source._inSegment) {
			throw new Error(
				"SegmentedArray.pushFrom: Source has an open segment."
			);
		}
		if (source._constructor !== this._constructor) {
			throw new Error(
				"SegmentedArray.pushFrom: TypedArray constructor mismatch."
			);
		}
		if (source.itemLength !== this.itemLength) {
			throw new Error("SegmentedArray.pushFrom: itemLength mismatch.");
		}

		const sourceClosed = source._closedSegments;
		const remainingSlots = this.maxSegments - this._closedSegments;
		if (sourceClosed > remainingSlots) {
			throw new RangeError(
				`SegmentedArray.pushFrom: Not enough remaining segment slots (${remainingSlots}) to append ${sourceClosed} segments.`
			);
		}

		let writePosition = this._writePosition;

		for (
			let segmentIndex = 0;
			segmentIndex < sourceClosed;
			segmentIndex++
		) {
			const segmentBegin = source._offsets[segmentIndex];
			const segmentEnd = source._offsets[segmentIndex + 1];
			const segmentElements = segmentEnd - segmentBegin;

			this._offsets[this._closedSegments] = writePosition;

			if (segmentElements > 0) {
				this._ensureCapacity(writePosition + segmentElements);
				this._data.set(
					source._data.subarray(segmentBegin, segmentEnd),
					writePosition
				);
				writePosition += segmentElements;
			}

			this._closedSegments++;
			this._offsets[this._closedSegments] = writePosition;
		}

		this._writePosition = writePosition;
	}

	/**
	 * Shrink the buffer to the exact number of written **elements**
	 * (i.e., the current high-water mark `sizeElements`).
	 *
	 * In typical append-only usage, calling `pack()` after building is **safe**
	 * for any zero-copy views (e.g., those returned by {@link segmentDataView} or
	 * {@link segmentItemViews}) because those views point within `0 .. sizeElements-1`.
	 *
	 * **Resizable buffer**
	 * - Shrinks in place via `buffer.resize(...)`.
	 * - If you first reduce the high-water mark (e.g., by calling {@link clear})
	 *   and then call `trim()`, any previously obtained views whose ranges lie
	 *   beyond the new size will become **length-0**.
	 *
	 * **Classic buffer**
	 * - Allocates a new tight TypedArray and copies data.
	 * - Previously obtained views remain valid because they still reference
	 *   the old buffer; its memory will not be reclaimed until those views are garbage-collected.
	 *
	 * @throws {Error} If called while a segment is open.
	 */
	public trim(): void {
		if (this._inSegment) {
			throw new Error(
				"SegmentedArray: Cannot trim while a segment is open."
			);
		}

		const used = this._writePosition;
		if (this._isResizable) {
			/**
			 * This is safe, because SegmentedArray instances using SharedArrayBuffer
			 * (created using `fromShared`) are readonly.
			 */
			(this._buffer as ArrayBuffer).resize(
				used * this._constructor.BYTES_PER_ELEMENT
			);
			return;
		}

		if (used < this._data.length) {
			const packedView = new this._constructor(used);
			packedView.set(this._data.subarray(0, used));
			this._data = packedView;
			this._buffer = packedView.buffer as ArrayBuffer; // guaranteed to not be a SharedArrayBuffer
		}
	}

	/**
	 * Return the underlying typed array view over the data buffer (zero-copy).
	 * Useful for hot-path iteration without per-segment subarray creation.
	 *
	 * ### Semantics
	 * - **Resizable buffer:** The returned view is length-tracking; when the buffer grows,
	 *   the **same** view reflects the new length. When the buffer shrinks (e.g. after
	 *   `clear()` then `trim()`), the view’s length may decrease (possibly to `0`).
	 * - **Classic buffer:** Capacity growth replaces the internal buffer and typed array.
	 *   Any previously returned view from `unsafeData()` will keep pointing at the **old**
	 *   buffer and will **not** see later writes. Treat such references as **stale** after
	 *   any operation that might grow capacity (`pushItem*`, `pushSegment`, concat/pushFrom).
	 *
	 * ### Guidance
	 * - Fetch `unsafeData()` **just-in-time** for a tight loop, and **do not retain** it
	 *   across calls that can change capacity. If you do need to keep a reference, refresh
	 *   it after each potential growth.
	 * - This is an **unsafe** API: no bounds checks. Do not read/write beyond
	 *   `[0, sizeElements)`. Mutations affect this `SegmentedArray`.
	 *
	 * @example
	 * ```ts
	 * // Process one finalized segment without per-segment subarray allocations:
	 * const begin = array.unsafeSegmentStart(index);
	 * const end   = array.unsafeSegmentEnd(index);
	 *
	 * // Get a fresh reference *after* any writes that could have triggered growth:
	 * const data = array.unsafeData();
	 *
	 * for (let i = begin; i < end; i += array.itemLength) {
	 *   // Example: scale first element of each item
	 *   data[i] *= 2;
	 * }
	 *
	 * // If you now append more (which may grow in classic mode) and need to continue,
	 * // reacquire the reference:
	 * array.pushItem(...); // may grow in classic mode
	 * const data2 = array.unsafeData(); // refresh before using again
	 * ```
	 */
	public unsafeData(): TypedArray {
		return this._data;
	}

	/**
	 * Start element index (inclusive) of a finalized segment.
	 *
	 * **Warning:** Unsafe API. No range checks; passing a segment index outside
	 * `[0, sizeSegments)` is undefined behavior.
	 *
	 * @param segment - Finalized segment index.
	 * @returns The starting element index (inclusive).
	 */
	public unsafeSegmentStart(segment: number): number {
		return this._offsets[segment];
	}

	/**
	 * End element index (exclusive) of a finalized segment.
	 *
	 * **Warning:** Unsafe API. No range checks; passing a segment index outside
	 * `[0, sizeSegments)` is undefined behavior.
	 *
	 * @param segment - Finalized segment index.
	 * @returns The ending element index (exclusive).
	 */
	public unsafeSegmentEnd(segment: number): number {
		return this._offsets[segment + 1];
	}

	/**
	 * Number of items in a finalized segment.
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @returns The item count (`elementsInSegment / itemLength`).
	 * @throws {RangeError|Error} If the segment is out of range or not finalized.
	 */
	public segmentLength(segment: number): number {
		this._assertSegmentClosed(segment);
		const elements = this._offsets[segment + 1] - this._offsets[segment];
		return Math.floor(elements / this.itemLength);
	}

	/**
	 * Zero-copy view of the segment's raw elements as a TypedArray subarray.
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @returns A subarray into the same underlying buffer (no allocation).
	 * @throws {RangeError|Error} If the segment is out of range or not finalized.
	 */
	public segmentDataView(segment: number): TypedArray {
		this._assertSegmentClosed(segment);

		return this._data.subarray(
			this._offsets[segment],
			this._offsets[segment + 1]
		) as TypedArray;
	}

	/**
	 * Iterate over zero-copy views of all finalized segments.
	 * Each yielded value is a TypedArray subarray covering that segment's elements.
	 */
	public *segmentDataViews(): IterableIterator<TypedArray> {
		for (let segment = 0; segment < this._closedSegments; segment++) {
			yield this.segmentDataView(segment);
		}
	}

	/**
	 * Copy of the segment's raw elements as a newly allocated TypedArray.
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @returns A new TypedArray containing only the segment's data.
	 * @throws {RangeError|Error} If the segment is out of range or not finalized.
	 */
	public segmentDataCopy(segment: number): TypedArray {
		this._assertSegmentClosed(segment);

		return this._data.slice(
			this._offsets[segment],
			this._offsets[segment + 1]
		) as TypedArray;
	}

	/**
	 * Iterate over newly allocated copies of each finalized segment.
	 * Each yielded value is a new TypedArray containing only that segment's elements.
	 */
	public *segmentDataCopies(): IterableIterator<TypedArray> {
		for (let segment = 0; segment < this._closedSegments; segment++) {
			yield this.segmentDataCopy(segment);
		}
	}

	/**
	 * Item-oriented view over a segment: read/write items by index,
	 * without copying the underlying elements.
	 *
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @returns A {@link SegmentView} bound to this segment.
	 * @throws {RangeError|Error} If the segment is out of range or not finalized.
	 */
	public segmentView(segment: number): SegmentView<TypedArray> {
		this._assertSegmentClosed(segment);

		const begin = this._offsets[segment];
		const end = this._offsets[segment + 1];
		const items = Math.floor((end - begin) / this.itemLength);
		return new SegmentView(this._data, begin, items, this.itemLength);
	}

	/**
	 * Iterate over per-segment item views.
	 * Each yielded value is a {@link SegmentView} bound to one finalized segment.
	 */
	public *segmentViews(): IterableIterator<SegmentView<TypedArray>> {
		for (let segment = 0; segment < this._closedSegments; segment++) {
			yield this.segmentView(segment);
		}
	}

	/**
	 * Iterate over **per-item zero-copy views** of a segment.
	 * Each yielded value is a `TypedArray` subarray of length `itemLength`
	 * referencing the same backing buffer.
	 *
	 * - With a resizable buffer, views remain valid across growth.
	 * - With classic growth, views remain valid but pin old buffers in memory
	 *   until those views are GC'd.
	 *
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @returns An iterator over `TypedArray` subarrays (no allocations for data).
	 * @throws {RangeError|Error} If the segment is out of range or not finalized.
	 */
	public *segmentItemViews(segment: number): IterableIterator<TypedArray> {
		yield* this.segmentView(segment).itemViews();
	}

	/**
	 * Iterate over per-item copies (new arrays) of a segment.
	 * Each yielded value is a freshly allocated `number[]` of length `itemLength`.
	 *
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @throws {RangeError|Error} If the segment is out of range or not finalized.
	 */
	public *segmentItemCopies(segment: number): IterableIterator<number[]> {
		yield* this.segmentView(segment).itemCopies();
	}

	/**
	 * Read a single item from a segment.
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @param item - Item index in `[0, segmentLength(segment))`.
	 * @returns A freshly allocated `number[]` of length `itemLength`.
	 * @throws {RangeError|Error} If the segment/item is out of range or not finalized.
	 */
	public getItem(segment: number, item: number): number[] {
		return this.segmentView(segment).getItemCopy(item);
	}

	/**
	 * Overwrite a single item in a segment.
	 * @param segment - Segment index in `[0, maxSegments)`.
	 * @param item - Item index in `[0, segmentLength(segment))`.
	 * @param itemValue - Array-like of length `itemLength`.
	 * @throws {RangeError|Error} If the segment/item is out of range or not finalized.
	 */
	public setItem(
		segment: number,
		item: number,
		itemValue: ArrayLike<number>
	): void {
		this.segmentView(segment).setItem(item, itemValue);
	}

	/**
	 * Default iteration yields zero-copy views of all finalized segments.
	 * Equivalent to {@link segmentDataViews}.
	 */
	public *[Symbol.iterator](): IterableIterator<TypedArray> {
		yield* this.segmentDataViews();
	}

	/**
	 * Zero-copy view over the concatenated **elements** of all **finalized segments**.
	 *
	 * - O(1) (no allocation or copying).
	 * - Excludes any currently open segment (call {@link endSegment} to include it).
	 * - View semantics follow {@link trim} / {@link clear}:
	 *   - With a resizable buffer, shrinking below this range (e.g. `clear()` then `trim()`)
	 *     can turn previously returned views into length-0.
	 *   - With a classic buffer, previously returned views remain valid but keep the
	 *     old buffer alive until garbage-collected.
	 *
	 * @returns a `TypedArray` subarray spanning indices `[0, _offsets[sizeSegments])`.
	 */
	public flatDataView(): TypedArray {
		const end = this._offsets[this._closedSegments];
		return this._data.subarray(0, end) as TypedArray;
	}

	/**
	 * Copy of the concatenated **elements** of all **finalized segments**.
	 * `[0, _offsets[sizeSegments])`.
	 *
	 * - Excludes any currently open segment (call {@link endSegment} to include it).
	 * - The returned array is independent of the backing store.
	 *
	 * @returns a newly allocated `TypedArray` containing indices
	 */
	public flatDataCopy(): TypedArray {
		const end = this._offsets[this._closedSegments];
		return this._data.slice(0, end) as TypedArray;
	}

	/**
	 * Clear all data and reset the structure for reuse.
	 *
	 * - Keeps current capacity and the underlying buffer (no allocations).
	 * - Does **not** zero out existing bytes.
	 * - Resets `sizeElements` to `0` and marks all segments as not finalized.
	 * - Existing zero-copy views obtained before `clear()` still reference the
	 *   prior contents and remain usable.
	 *
	 * Interaction with {@link trim}:
	 * - **Resizable buffer:** If you call `trim()` after `clear()`, the buffer
	 *   may shrink to zero bytes; any previously obtained views whose ranges exceed
	 *   the new size will become **length-0**.
	 * - **Classic buffer:** If you call `trim()` after `clear()`, a new tight
	 *   buffer is allocated internally. Previously obtained views keep the **old buffer**
	 *   alive, so that memory will **not be reclaimed** until those views are
	 *   garbage-collected.
	 *
	 * @throws {Error} If called while a segment is open.
	 */
	public clear(): void {
		if (this._inSegment) {
			throw new Error(
				"SegmentedArray: Cannot clear while a segment is open."
			);
		}
		this._writePosition = 0;
		this._closedSegments = 0;
		this._offsets.fill(0);
	}

	/**
	 * Ensure the backing store can hold at least `requiredElements` elements.
	 * Growth policy: geometric - grow to
	 * `max(currentCapacity * growthFactor, requiredElements)`,
	 * clamped to `maxBytes` when using a resizable buffer.
	 *
	 * - Resizable buffer: `buffer.resize(targetBytes)` in one step (length-tracking view grows automatically).
	 * - Classic buffer: allocate a new TypedArray of `targetElements`, copy, and swap.
	 *
	 * @param requiredElements - Required capacity in elements.
	 * @internal
	 */
	private _ensureCapacity(requiredElements: number): void {
		if (requiredElements <= this._data.length) {
			return;
		}

		const bytesPerElement = this._constructor.BYTES_PER_ELEMENT;
		const currentElements = this._data.length;
		const grownElements =
			currentElements > 0
				? Math.ceil(currentElements * this._growthFactor)
				: requiredElements;
		const targetElements = Math.max(requiredElements, grownElements);

		if (this._isResizable) {
			// resizable buffer

			const requiredBytes = requiredElements * bytesPerElement;
			if (requiredBytes > this._maxBytes) {
				throw new RangeError(
					`SegmentedArray: Requested ${requiredBytes} bytes exceeds resizable max ${this._maxBytes} bytes (maxItems * itemLength * BYTES_PER_ELEMENT).`
				);
			}

			const targetBytes = Math.min(
				targetElements * bytesPerElement,
				this._maxBytes
			);

			/**
			 * This is safe, because SegmentedArray instances using SharedArrayBuffer
			 * (created using `fromShared`) are readonly.
			 */
			(this._buffer as ArrayBuffer).resize(targetBytes);
			return;
		} else {
			// classic buffer (copy values to new buffer)

			const newData = new this._constructor(targetElements);
			newData.set(this._data);
			this._data = newData;
			this._buffer = newData.buffer as ArrayBuffer; // guaranteed to be an ArrayBuffer
		}
	}

	/**
	 * Validate that a segment index is within range and finalized.
	 * @param segment - Segment index to check.
	 * @throws {RangeError|Error} If invalid or not closed.
	 * @internal
	 */
	private _assertSegmentClosed(segment: number): void {
		if (segment < 0 || segment >= this.maxSegments) {
			throw new RangeError(
				"SegmentedArray: Segment index out of bounds."
			);
		}

		if (segment >= this._closedSegments) {
			throw new Error(
				"SegmentedArray: Segment not finalized yet (call endSegment())."
			);
		}
	}

	/**
	 * Calculates the element-offset array from a complete array of segment lengths.
	 *
	 * This is a utility function to help pre-allocate buffers for {@link fromBuffers}.
	 *
	 * @param segmentLengths - An array where index `i` is the *item count* for segment `i`.
	 * @param itemLength - The number of elements per item (e.g., 2 for [x,y]).
	 * @param shared - If true (default), returns a SharedArrayBuffer.
	 * If false, returns a standard ArrayBuffer.
	 * @returns An `ArrayBuffer` or `SharedArrayBuffer`
	 */
	public static buildOffsets(
		segmentLengths: Uint32Array,
		itemLength: number,
		shared?: true
	): SharedArrayBuffer;
	public static buildOffsets(
		segmentLengths: Uint32Array,
		itemLength: number,
		shared: false
	): ArrayBuffer;
	public static buildOffsets(
		segmentLengths: Uint32Array,
		itemLength: number,
		shared = true
	): ArrayBuffer | SharedArrayBuffer {
		const segmentCount = segmentLengths.length;
		const byteLength = (segmentCount + 1) * Uint32Array.BYTES_PER_ELEMENT;

		const buffer = shared
			? new SharedArrayBuffer(byteLength)
			: new ArrayBuffer(byteLength);

		const offsets = new Uint32Array(buffer);

		let elementCounter = 0;
		for (let i = 0; i < segmentCount; i++) {
			offsets[i] = elementCounter;
			elementCounter += segmentLengths[i] * itemLength;
		}
		offsets[segmentCount] = elementCounter;

		return buffer;
	}

	/**
	 * Creates a new `SharedArrayBuffer` that can be used to build a new
	 * `SegmentedArray` using {@link fromBuffers}.
	 *
	 * @param offsets - The offsets array created by {@link buildOffsets}
	 * @param constructor - The concrete TypedArray constructor (e.g. `Uint16Array`).
	 * @returns A `SharedArrayBuffer`
	 */
	public static createSharedDataBuffer<T extends NumberTypedArray>(
		offsets: Uint32Array,
		constructor: TypedArrayConstructor<T>
	): SharedArrayBuffer {
		return new SharedArrayBuffer(
			offsets[offsets.length - 1] * constructor.BYTES_PER_ELEMENT
		);
	}

	/**
	 * Wraps existing (potentially shared) buffers into a SegmentedArray.
	 * Assumes offsets and data are pre-filled.
	 * The returned instance is read-only, write/growth methods are disabled.
	 *
	 * @param constructor - The concrete TypedArray constructor (e.g. `Uint16Array`).
	 * @param itemLength - Number of elements per item.
	 * @param dataBuffer - The `ArrayBufferLike` (e.g. `SharedArrayBuffer`) for data.
	 * @param offsetsBuffer - The `ArrayBufferLike` (e.g. `SharedArrayBuffer`) for offsets.
	 * @returns A new, read-only `SegmentedArray` instance.
	 */
	public static fromBuffers<T extends NumberTypedArray>(
		constructor: TypedArrayConstructor<T>,
		itemLength: number,
		dataBuffer: ArrayBufferLike,
		offsetsBuffer: ArrayBufferLike
	): ReadonlySegmentedArray<T> {
		const offsets = new Uint32Array(offsetsBuffer);
		const maxSegments = offsets.length - 1;
		const data = new constructor(dataBuffer);

		const instance = new SegmentedArray<T>(
			constructor,
			itemLength,
			maxSegments,
			data,
			offsets,
			data.length, // writePosition
			maxSegments, // closedSegments
			false, // isResizable
			dataBuffer.byteLength, // maxBytes
			1 // growthFactor
		);

		return SegmentedArray.toReadonly(instance);
	}

	/**
	 * Converts a mutable SegmentedArray instance into a read-only version *in-place*.
	 *
	 * This method overwrites all mutation methods on the provided instance
	 * (e.g., `pushItem`, `trim`, `clear`) to make them throw an error if called.
	 *
	 * @warning This is a destructive operation that modifies the provided object.
	 *
	 * @typeParam T - The underlying numeric TypedArray type.
	 * @param segmentedArray - The mutable `SegmentedArray` instance to convert.
	 * @returns The *same* instance, now typed as `ReadonlySegmentedArray`.
	 */
	public static toReadonly<T extends NumberTypedArray>(
		segmentedArray: SegmentedArray<T>
	): ReadonlySegmentedArray<T> {
		const readOnlyError = () => {
			throw new Error("This SegmentedArray is read-only and fixed-size.");
		};

		segmentedArray.beginSegment = readOnlyError;
		segmentedArray.pushItem = readOnlyError;
		segmentedArray.pushItemData = readOnlyError;
		segmentedArray.endSegment = readOnlyError;
		segmentedArray.pushSegment = readOnlyError;
		segmentedArray.pushFrom = readOnlyError;
		segmentedArray.trim = readOnlyError;
		segmentedArray.clear = readOnlyError;

		return segmentedArray;
	}

	/**
	 * Concatenate multiple `SegmentedArray<T>` instances into a single result.
	 *
	 * - All inputs must use the same TypedArray constructor and the same `itemLength`.
	 * - Inputs must not have an open segment in progress.
	 * - Segments are appended in the order of `arrays[0], arrays[1], ...` and
	 *   preserve their original per-segment boundaries (including empty segments).
	 *
	 * Result characteristics
	 * - The returned array uses a **classic buffer**.
	 * - Initial capacity is sized exactly to the sum of finalized **items** across inputs,
	 *   so no growth occurs while copying.
	 * - This helper is intended for “finalization” workflows; if you plan to keep appending,
	 *   build a new `SegmentedArray` and include it in a later concat instead.
	 *
	 * Limits
	 * - Offsets are stored in a `Uint32Array`, so the total number of **elements**
	 *   in the concatenated result must be ≤ `4_294_967_295`.
	 *
	 * Complexity
	 * - Time: O(totalElements)
	 * - Extra space: O(1) beyond the new result's buffers.
	 *
	 * @typeParam T - Concrete numeric TypedArray type shared by all inputs.
	 * @param arrays - Non-empty list of sources to concatenate.
	 * @returns A new `SegmentedArray<T>` containing all segments from `arrays` in order.
	 *
	 * @throws {Error} If `arrays` is empty.
	 * @throws {Error} If TypedArray constructors differ across inputs.
	 * @throws {Error} If `itemLength` differs across inputs.
	 * @throws {Error} If total elements exceed the `Uint32` limit
	 * @throws {Error} If any input has an open segment.
	 */
	public static concat<T extends NumberTypedArray>(
		arrays: readonly SegmentedArray<T>[]
	): SegmentedArray<T> {
		if (arrays.length === 0) {
			throw new Error(
				"SegmentedArray.concat: At least one input is required."
			);
		}

		const first = arrays[0];
		const constructor = first._constructor;
		const itemLength = first.itemLength;

		let totalClosedSegments = 0;
		let totalElements = 0;

		for (const array of arrays) {
			if (array._inSegment) {
				throw new Error(
					"SegmentedArray.concat: Source has an open segment."
				);
			}
			if (array._constructor !== constructor) {
				throw new Error(
					"SegmentedArray.concat: All inputs must share the same TypedArray constructor."
				);
			}
			if (array.itemLength !== itemLength) {
				throw new Error(
					"SegmentedArray.concat: All inputs must share the same itemLength."
				);
			}

			const closed = array._closedSegments;
			totalClosedSegments += closed;
			totalElements += array._offsets[closed];
		}

		if (totalElements > UINT32_MAX) {
			throw new Error(
				`SegmentedArray.concat: total elements ${totalElements} exceed Uint32 capacity ${UINT32_MAX}.`
			);
		}

		const totalItems = Math.floor(totalElements / itemLength);

		const out = SegmentedArray.create(
			constructor,
			itemLength,
			totalClosedSegments,
			{ initialItemCapacity: totalItems }
		);

		let writePosition = 0;
		out._closedSegments = 0;
		out._inSegment = false;
		out._offsets[0] = 0;

		for (const array of arrays) {
			const closed = array._closedSegments;
			for (let segmentIndex = 0; segmentIndex < closed; segmentIndex++) {
				const segmentBegin = array._offsets[segmentIndex];
				const segmentEnd = array._offsets[segmentIndex + 1];
				const segmentElements = segmentEnd - segmentBegin;

				out._offsets[out._closedSegments] = writePosition;

				if (segmentElements > 0) {
					out._ensureCapacity(writePosition + segmentElements);
					out._data.set(
						array._data.subarray(segmentBegin, segmentEnd),
						writePosition
					);
					writePosition += segmentElements;
				}

				out._closedSegments++;
				out._offsets[out._closedSegments] = writePosition;
			}
		}

		out._writePosition = writePosition;
		return out;
	}

	/** See {@link CacheableClass}. */
	static readonly CACHE_CODEC_CONFIG = {
		id: "SegmentedArray",
		version: 1,
	};

	/** @inheritdoc */
	public dehydrate(): SegmentedArrayDTO {
		return {
			itemLength: this.itemLength,
			maxSegments: this.maxSegments,
			sizeSegments: this._closedSegments,
			sizeElements: this._writePosition,
			isResizable: this._isResizable,
			maxBytes: this._maxBytes,
			growthFactor: this._growthFactor,
			data: this._data,
			offsets: this._offsets,
		};
	}

	/** @inheritdoc */
	public pack(): {
		payload: SegmentedArrayDTO;
		transfer: Transferable[];
	} {
		const payload = this.dehydrate();
		const transfer = new Set<Transferable>();

		if (!(this._data.buffer instanceof SharedArrayBuffer)) {
			transfer.add(this._data.buffer);
		}
		if (!(this._offsets.buffer instanceof SharedArrayBuffer)) {
			transfer.add(this._offsets.buffer);
		}

		return { payload, transfer: [...transfer] };
	}

	/** See {@link CacheableClass}. */
	public static hydrate<T extends NumberTypedArray>(
		dto: SegmentedArrayDTO
	): SegmentedArray<T> {
		return new SegmentedArray<T>(
			dto.data.constructor as TypedArrayConstructor<T>,
			dto.itemLength,
			dto.maxSegments,
			dto.data as T,
			dto.offsets,
			dto.sizeElements,
			dto.sizeSegments,
			dto.isResizable,
			dto.maxBytes,
			dto.growthFactor
		);
	}

	/** See {@link WorkerTransferableClass}. */
	public static unpack<T extends NumberTypedArray>(
		dto: SegmentedArrayDTO
	): SegmentedArray<T> {
		return SegmentedArray.hydrate(dto);
	}
}

const baseCacheCodec = createBinaryCacheCodecFromClass(SegmentedArray);
const baseWorkerCodec = createWorkerCodecFromClass(SegmentedArray);

/**
 * Gets a strongly-typed Cache Codec for a specific SegmentedArray type.
 *
 * @typeParam T - The TypedArray type.
 */
export function getSegmentedArrayCacheCodec<T extends NumberTypedArray>() {
	return baseCacheCodec as unknown as BinaryCacheCodec<
		SegmentedArray<T>,
		SegmentedArrayDTO
	>;
}

/**
 * Gets a strongly-typed Cache Codec for a specific SegmentedArray type.
 *
 * @typeParam T - The TypedArray type.
 */
export function getReadonlySegmentedArrayCacheCodec<
	T extends NumberTypedArray
>() {
	return baseCacheCodec as unknown as BinaryCacheCodec<
		ReadonlySegmentedArray<T>,
		SegmentedArrayDTO
	>;
}

/**
 * Gets a strongly-typed Worker Codec for a specific SegmentedArray type.
 *
 * @typeParam T - The TypedArray type.
 */
export function getSegmentedArrayWorkerCodec<T extends NumberTypedArray>() {
	return baseWorkerCodec as WorkerCodec<SegmentedArray<T>, SegmentedArrayDTO>;
}

/**
 * Gets a strongly-typed Worker Codec for a specific SegmentedArray type.
 *
 * @typeParam T - The TypedArray type.
 */
export function getReadonlySegmentedArrayWorkerCodec<
	T extends NumberTypedArray
>() {
	return baseWorkerCodec as unknown as WorkerCodec<
		ReadonlySegmentedArray<T>,
		SegmentedArrayDTO
	>;
}
