import type { Path } from "./Path";
import type { Reader } from "./Reader";
import type { Writer } from "./Writer";

/**
 * Represents a piece of binary data supported by the store.
 */
export type Chunk = ArrayBuffer | SharedArrayBuffer | ArrayBufferView;

/**
 * Low-level interface for the backing storage mechanism.
 * Abstraction layer over the actual file system.
 */
export interface Store {
	/**
	 * Checks whether a file exists at the given path.
	 *
	 * This method only tests for existence and does not read file contents.
	 *
	 * @param path - The path to test.
	 * @returns A promise resolving to `true` if the file exists, `false` otherwise.
	 */
	has(path: Path): Promise<boolean>;

	/**
	 * Retrieves a `File` object representing the file at the given path.
	 *
	 * The returned `File` provides a snapshot of the file state and implements
	 * the `Blob` interface, allowing efficient slicing and streaming without
	 * loading the entire file into memory.
	 *
	 * @param path - The path to retrieve.
	 * @returns A promise resolving to the `File` object, or `null` if the file does not exist.
	 */
	getFile(path: Path): Promise<File | null>;

	/**
	 * Reads file content at the specified path into a new ArrayBuffer.
	 *
	 * @remarks
	 * **Bounds Behavior (Clamping):**
	 * - If the requested range extends beyond the end of the file, the returned
	 * buffer will contain only the available bytes (it will be smaller than `length`).
	 * - If `offset` is greater than or equal to the file size, an empty
	 * ArrayBuffer is returned.
	 *
	 * @param path - The path to read from.
	 * @param offset - The byte offset to start reading from (default: 0).
	 * @param length - The maximum number of bytes to read (default: rest of file).
	 * @returns A promise resolving to the file content as an ArrayBuffer, or null if not found.
	 */
	read(
		path: Path,
		offset?: number,
		length?: number
	): Promise<ArrayBuffer | null>;

	/**
	 * Reads file content directly into a provided buffer.
	 * This method is designed for high-performance scenarios to minimize garbage
	 * collection overhead by reusing allocated memory.
	 *
	 * @remarks
	 * **Performance Characteristics**
	 * - **Worker Thread (Sync Store):** **Zero-Copy**. Data is read directly from disk
	 * into the provided buffer/view (including `SharedArrayBuffer`).
	 * - **Main Thread (Async Store):** **One Copy**. Due to browser API limitations,
	 * the data is read into a temporary buffer first and then copied into your target.
	 *
	 * **Thread Safety (SharedArrayBuffer)**
	 *
	 * If `target` is backed by a `SharedArrayBuffer`, it must be ensured that no other
	 * thread modifies the buffer during this operation.
	 * - **Sync Store:** The worker is blocked during the read, preventing internal modification,
	 * but other threads can still write to it (causing tearing).
	 * - **Async Store:** The operation is non-blocking; concurrent writes will result
	 * in unpredictable data.
	 *
	 * **Bounds Behavior**
	 *
	 * Reads data starting at the file's `offset` and writes it into the `target`
	 * starting at the target's byte offset 0. The number of bytes read is the
	 * **minimum** of:
	 * 1. The size of the `target` buffer.
	 * 2. The remaining bytes in the file (`fileSize - offset`).
	 *
	 * If `offset` is past the end of the file, 0 bytes are read.
	 *
	 * @param path - The source path.
	 * @param target - The destination buffer or view.
	 * @param offset - The byte offset in the file to start reading from (default: 0).
	 * @returns The number of bytes actually read, or null if not found.
	 */
	readInto(
		path: Path,
		target: Chunk,
		offset?: number
	): Promise<number | null>;

	/**
	 * Opens a random-access reader for the specified path.
	 *
	 * The reader allows efficient slicing and partial reading of the file
	 * without loading the entire content into memory.
	 *
	 * @param path - The path to read from.
	 * @returns A promise resolving to a {@link Reader} instance, or `null` if
	 * the file does not exist.
	 */
	openReader(path: Path): Promise<Reader | null>;

	/**
	 * Writes data to the specified path.
	 *
	 * Implementations must overwrite any existing file at `path`.
	 *
	 * @remarks
	 * **SharedArrayBuffer Support:**
	 * - **Worker Thread (Sync Store):** **Zero-Copy**. Writes directly from the SAB
	 * to disk. *Warning:* You must implement an application-level lock to prevent other threads
	 * from modifying the SAB during this write, or data corruption (tearing) might occur.
	 * - **Main Thread (Async Store):** **Copy-On-Write**. Browser security policies
	 * forbid passing `SharedArrayBuffer` to async I/O APIs. This implementation will automatically
	 * **clone** the data into a temporary `ArrayBuffer` before writing. This prevents tearing
	 * but doubles memory usage for the duration of the write.
	 *
	 * @param path - The destination path.
	 * @param data - The data chunk(s) to write.
	 * @returns A promise resolving to `true` if successful, `false` otherwise
	 * (e.g., if quota is exceeded).
	 */
	write(path: Path, data: Chunk | readonly Chunk[]): Promise<boolean>;

	/**
	 * Opens a streaming writer for the specified path.
	 *
	 * The returned {@link Writer} always starts at byte position 0 and
	 * overwrites any existing file at that path. Random access and seeking
	 * are not supported.
	 *
	 * @remarks
	 * Writers created via the **Sync Store** support `SharedArrayBuffer` for zero-copy
	 * streaming writes, subject to the same thread-safety warnings as {@link write}.
	 * Writers via the **Async Store** will clone shared buffers.
	 *
	 * @param path - The destination path.
	 * @returns A promise resolving to a {@link Writer} instance.
	 */
	openWriter(path: Path): Promise<Writer>;

	/**
	 * Deletes the file at the specified path.
	 *
	 * @param path - The path to delete.
	 */
	delete(path: Path): Promise<void>;

	/**
	 * Retrieves the size of the file at the specified path.
	 *
	 * @param path - The path to check.
	 * @returns The size in bytes, or null if the file does not exist.
	 */
	fileSize(path: Path): Promise<number | null>;

	/**
	 * Retrieves an estimate of the current storage usage and available quota.
	 *
	 * Returns the best-effort values provided by the underlying environment. The
	 * numbers are approximate and may not reflect real-time usage immediately.
	 *
	 * @returns A promise resolving to an object containing:
	 * - `usage`: The estimated number of bytes currently used.
	 * - `quota`: The estimated maximum number of bytes available.
	 */
	getUsageEstimate(): Promise<{ usage: number; quota: number }>;
}
