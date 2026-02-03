import type { Entry } from "./Entry";
import type { Reader } from "./Reader";
import type {
	InputOfResource,
	OutputOfResource,
	Resource,
	ResourceUsableWithScope,
	TypedResource,
} from "./Resource";
import type { Scope } from "./Scope";
import type { Chunk } from "./Store";
import type { Writer } from "./Writer";

/**
 * Represents an active interaction session within a specific Scope.
 * Allows reading, writing, streaming, and deleting resources bounded by that scope.
 *
 * @typeParam S - The type of Scope for this session.
 */
export interface Session<S extends Scope> {
	/**
	 * The scope configuration for this session.
	 */
	readonly scope: S;

	/**
	 * Checks whether the given resource is present in the cache for this
	 * session's scope.
	 *
	 * This is a lightweight existence check and does not read the resource
	 * payload into memory.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource descriptor to test.
	 * @returns A promise resolving to `true` if the resource is cached,
	 *          `false` otherwise.
	 */
	has<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<boolean>;

	/**
	 * Retrieves metadata for the given resource within this session's scope.
	 *
	 * This returns the corresponding cache entry from the metadata index, or
	 * `null` if the resource is not known to the index. It does not verify the
	 * presence of the underlying file in the store.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource descriptor to inspect.
	 * @returns A promise resolving to the entry metadata, or `null` if not present.
	 */
	stats<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<Entry | null>;

	/**
	 * Retrieves the cached resource as a standard browser `File` object.
	 *
	 * This is useful for:
	 * - Uploading the cached file via `FormData` without reading it into js memory.
	 * - Creating an object URL (`URL.createObjectURL`) for display (e.g., images/video).
	 *
	 * @remarks
	 * This operation updates the `lastAccessedAt` metadata timestamp.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource identifier.
	 * @returns A promise resolving to the `File` object, or `null` if not found.
	 */
	getFile<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<File | null>;

	/**
	 * Reads a binary resource as raw bytes.
	 * Returns null if the resource is not found.
	 *
	 * @remarks
	 * This method always allocates a new `ArrayBuffer`. For zero-copy operations
	 * or reading into shared memory, use {@link readRawInto}.
	 *
	 * **Bounds Behavior (Clamping)**
	 * - If the requested range extends beyond the end of the file, the returned
	 * buffer will contain only the available bytes (it will be smaller than `length`).
	 * - If `offset` is greater than or equal to the file size, an empty
	 * ArrayBuffer is returned.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The raw resource identifier.
	 * @param offset - The byte offset to start reading from (default: 0).
	 * @param length - The number of bytes to read (default: rest of file).
	 * @returns A promise resolving to the file data as an ArrayBuffer, or `null`.
	 */
	readRaw<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>,
		offset?: number,
		length?: number
	): Promise<ArrayBuffer | null>;

	/**
	 * Reads a resource directly into a provided buffer.
	 *
	 * This allows reading directly into `SharedArrayBuffer` instances or reusing
	 * existing buffers to reduce garbage collection.
	 *
	 * @remarks
	 * Reads up to `target.byteLength` bytes from the file. If the file is smaller
	 * than the target buffer, only the available bytes are read and the rest of
	 * the target buffer is left unchanged. If `offset` is past the end of the file,
	 * 0 bytes are read.
	 *
	 * @param resource - The resource identifier.
	 * @param target - The destination buffer or view.
	 * @param offset - The byte offset in the file to start reading from (default: 0).
	 * @returns The number of bytes actually read, or `null` if the resource was not found.
	 */
	readRawInto<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>,
		target: Chunk,
		offset?: number
	): Promise<number | null>;

	/**
	 * Opens a random-access reader for the given resource.
	 *
	 * The reader allows efficient slicing and partial reading of the file
	 * without loading the entire content into memory.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource identifier.
	 * @returns A promise resolving to a {@link Reader} instance, or `null` if not found.
	 */
	openReader<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<Reader | null>;

	/**
	 * Reads and decodes a typed resource from the cache.
	 *
	 * @typeParam R - The typed resource.
	 * @param resource - The resource definition containing a Codec.
	 * @returns The decoded object `Output`, or null if not found or corrupted.
	 */
	read<
		R extends TypedResource<Scope, OutputOfResource<R>, InputOfResource<R>>
	>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<OutputOfResource<R> | null>;

	/**
	 * Writes raw binary data to the cache for a given resource.
	 *
	 * Any existing content for the resource is overwritten.
	 *
	 * This convenience method is suitable for small to medium payloads that
	 * are already available in memory. For large or incrementally produced
	 * data, prefer {@link Session.openWriter}.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource identifier.
	 * @param data - The binary data (chunk or array of chunks) to write.
	 * @returns A promise resolving to `true` on success, or `false` (e.g., if quota is exceeded).
	 */
	writeRaw<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>,
		data: Chunk | readonly Chunk[]
	): Promise<boolean>;

	/**
	 * Opens a streaming writer for the given resource within this session's scope.
	 *
	 * The returned {@link Writer} always starts at byte position 0,
	 * overwriting any existing content for the resource. Each call to
	 * `write` appends at the current position and advances it by the number
	 * of bytes written. Random access and seeking are not supported in this
	 * initial version.
	 *
	 * Typically, small payloads can be written via {@link Session.write},
	 * while `openWriter` is useful for large or incrementally produced data.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource descriptor to write to.
	 * @returns A promise resolving to a {@link Writer} instance.
	 */
	openWriter<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<Writer>;

	/**
	 * Encodes and writes a high-level object to the cache.
	 *
	 * This automatically handles opening a writer, streaming the encoded data
	 * via the resource's Codec, and closing the writer.
	 *
	 * Any existing objects are overwritten.
	 *
	 * @typeParam R - The typed resource.
	 * @param resource - The resource definition containing a Codec.
	 * @param data - The high-level object to persist (Input type).
	 */
	write<
		R extends TypedResource<Scope, OutputOfResource<R>, InputOfResource<R>>
	>(
		resource: ResourceUsableWithScope<R, S>,
		data: InputOfResource<R>
	): Promise<boolean>;

	/**
	 * Deletes a resource from the cache within this session's scope.
	 *
	 * @typeParam R - Resource type.
	 * @param resource - The resource identifier.
	 * @returns A promise that resolves once the resource has been removed.
	 */
	delete<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<void>;
}
