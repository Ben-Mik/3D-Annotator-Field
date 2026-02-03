import type { Chunk } from "./Store";

/**
 * A handle for reading random-access chunks from a cached file.
 * Must be closed after use to release resources.
 */
export interface Reader {
	/**
	 * The total length of the underlying file in bytes.
	 */
	readonly byteLength: number;

	/**
	 * Reads a specific byte range into a new ArrayBuffer.
	 *
	 * @remarks
	 * **Bounds Behavior (Clamping):**
	 * - If the requested range extends beyond the end of the file, the returned
	 * buffer will contain only the available bytes (it will be smaller than `length`).
	 * - If `offset` is greater than or equal to the file size, an empty
	 * ArrayBuffer is returned.
	 * - This method never throws for simple out-of-bounds access.
	 *
	 * @param offset - Byte offset to start reading (default: 0).
	 * @param length - Maximum number of bytes to read (default: Infinity / rest of file).
	 * @returns A promise resolving to the file data as an ArrayBuffer.
	 */
	read(offset?: number, length?: number): Promise<ArrayBuffer>;

	/**
	 * Reads a specific byte range into the provided target Buffer/View.
	 *
	 * @remarks
	 * **Bounds Behavior**
	 * Reads data starting at the file's `offset` and writes it into the `target`
	 * starting at the target's byte offset 0. The number of bytes read is the
	 * **minimum** of:
	 * 1. The size of the `target` buffer.
	 * 2. The remaining bytes in the file (`fileSize - offset`).
	 *
	 * If `offset` is past the end of the file, 0 bytes are read.
	 *
	 * Useful for reading directly into `SharedArrayBuffer` instances or reusing memory.
	 *
	 * @param target - The destination buffer.
	 * @param offset - Byte offset in the **file** to start reading from (default: 0).
	 * @returns A promise resolving to the number of bytes actually read.
	 */
	readInto(target: Chunk, offset?: number): Promise<number>;

	/**
	 * Creates a zero-copy File slice for a specific byte range.
	 *
	 * @remarks
	 * **Bounds Behavior:**
	 * Standard `Blob.slice` behavior applies:
	 * - If `offset` or `length` extend beyond the file boundaries, the slice is
	 * clamped to the actual file size.
	 * - An empty Blob is returned if `offset` is past the end of the file.
	 *
	 * Does not allocate any buffers. The resulting Blob references the raw
	 * data on disk.
	 *
	 * @param offset - Byte offset start (default: 0).
	 * @param length - Length of the slice (default: rest of file).
	 * @param mimeType - Optional MIME type for the resulting Blob.
	 * @returns A Blob representing the data slice.
	 */
	slice(offset?: number, length?: number, mimeType?: string): Blob;

	/**
	 * Closes the reader and releases associated resources (e.g. file locks).
	 * @returns A promise that resolves when closed.
	 */
	close(): Promise<boolean>;
}
