import { CategoryBuffer } from "~util/datastructures/CategoryBuffer";

/**
 * A high-performance buffer for storing the results of a BVH raycast
 * or similar selection operation.
 *
 * It separates face indices (`Uint32Array`) into two categories:
 * - **Contained:** For faces fully inside the selection.
 * - **Intersected:** For faces that partially intersect the selection.
 *
 * This class is a specialized, type-safe facade over `CategoryBuffer`,
 * fixed to use `Uint32Array` for index storage.
 *
 * @example
 * ```ts
 * // Create a buffer for 100,000 total indices
 * const selectionBuffer = new SelectionBuffer(100_000);
 *
 * // Add indices from a raycast
 * selectionBuffer.pushContained(101);
 * selectionBuffer.pushContained(102);
 * selectionBuffer.pushIntersected(103);
 *
 * // Get zero-copy results
 * const contained = selectionBuffer.getContained();     // Uint32Array[101, 102]
 * const intersected = selectionBuffer.getIntersected(); // Uint32Array[103]
 *
 * // Reset for the next operation
 * selectionBuffer.clear();
 * ```
 */
export class SelectionBuffer {
	private readonly _buffer: CategoryBuffer<Uint32Array>;

	/**
	 * Creates a new, empty SelectionBuffer.
	 *
	 * @param size - The total maximum number of indices the buffer can store.
	 */
	constructor(size: number) {
		this._buffer = CategoryBuffer.create(Uint32Array, size);
	}

	/**
	 * Total bytes allocated for the underlying data buffer.
	 */
	get bytesAllocated(): number {
		return this._buffer.bytesAllocated;
	}

	/**
	 * Total maximum number of elements this buffer can hold.
	 */
	get capacity(): number {
		return this._buffer.capacity;
	}

	/**
	 * The number of indices currently stored in the 'contained' category.
	 */
	get sizeContained(): number {
		return this._buffer.sizeA;
	}

	/**
	 * The number of indices currently stored in the 'intersected' category.
	 */
	get sizeIntersected(): number {
		return this._buffer.sizeB;
	}

	/**
	 * The total number of elements currently stored in the buffer
	 * (contained + intersected).
	 */
	get sizeTotal(): number {
		return this._buffer.sizeTotal;
	}

	/**
	 * The number of remaining slots available in the buffer.
	 */
	get remainingCapacity(): number {
		return this._buffer.remainingCapacity;
	}

	/**
	 * Appends a face index to the 'contained' category.
	 * This is an O(1) operation.
	 *
	 * @param index - The face index to add.
	 * @throws {RangeError} If the buffer is full.
	 */
	public pushContained(index: number): void {
		this._buffer.pushA(index);
	}

	/**
	 * Appends a face index to the 'intersected' category.
	 * This is an O(1) operation.
	 *
	 * @param index - The face index to add.
	 * @throws {RangeError} If the buffer is full.
	 */
	public pushIntersected(index: number): void {
		this._buffer.pushB(index);
	}

	/**
	 * Returns a zero-copy `Uint32Array` view of all 'contained' indices,
	 * in insertion order.
	 *
	 * The returned view is valid until the next call to `clear()`.
	 * The view's length is fixed upon creation. Subsequent calls to
	 * `pushContained()` will not be reflected in a previously-obtained view.
	 *
	 * Modifying the view will modify the underlying buffer.
	 *
	 * This is an O(1) operation (creates a view, not a copy).
	 *
	 * @returns A `Uint32Array` view of the 'contained' indices.
	 */
	public getContained(): Uint32Array {
		return this._buffer.getCategoryAView();
	}

	/**
	 * Returns a zero-copy `Uint32Array` view of all 'intersected' indices.
	 *
	 * **Note:** Indices appear in **reverse insertion order**
	 * (e.g., `pushIntersected(1)`, `pushIntersected(2)` results in
	 * a view `[2, 1]`).
	 *
	 * The returned view is valid until the next call to `clear()`.
	 * The view's length is fixed upon creation. Subsequent calls to
	 * `pushIntersected()` will not be reflected in a previously-obtained view.
	 *
	 * Modifying the view will modify the underlying buffer.
	 *
	 * This is an O(1) operation (creates a view, not a copy).
	 *
	 * @returns A `Uint32Array` view of the 'intersected' indices.
	 */
	public getIntersected(): Uint32Array {
		return this._buffer.getCategoryBView();
	}

	/**
	 * Resets the buffer to an empty state.
	 * This is an O(1) operation, it does **not** zero the underlying memory.
	 */
	public clear(): void {
		this._buffer.clear();
	}
}
