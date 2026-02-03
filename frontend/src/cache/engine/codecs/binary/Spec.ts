import type { BinaryHint, BlobHint, FileHint, HintValue } from "./Hints";

/**
 * Maps a desired Output type (from DTO) to its allowed Input forms (for Dehydration).
 *
 * This ensures strict type safety when using Hints:
 * - If the DTO expects a `File`, the dehydrate function must return a `File` or a `FileHint`.
 * - Preserves `Array` structure recursively.
 * - Preserves `TypedArray` types (leaves, do not recurse).
 */
export type Encodable<T> = T extends ArrayBufferView
	? T
	: T extends File
	? T | FileHint
	: T extends Blob
	? T | BlobHint | FileHint
	: T extends SharedArrayBuffer
	? T | BinaryHint<HintValue, SharedArrayBuffer>
	: T extends ArrayBuffer
	? T | BinaryHint<HintValue, ArrayBuffer>
	: T extends (infer U)[]
	? Encodable<U>[]
	: T extends readonly (infer U)[]
	? readonly Encodable<U>[]
	: T extends object
	? { [K in keyof T]: Encodable<T[K]> }
	: T;

/**
 * Configuration specification for defining a BinaryCodec.
 *
 * Use this interface to define persistence logic.
 *
 * `ArrayBuffer`, `SharedArrayBuffer`, `ArrayBufferView`, `File` and `Blob` instances are
 * supported out of the box without the need for serialization or reconstruction. The content
 * will be written as a raw binary blob and reconstructed into the correct object before
 * hydration. When using views, they should be typed as the specific `TypedArray` or `DataView`
 * you intend to use (e.g., `Float32Array`).
 *
 * **Constraints:**
 * The DTO structure must be compatible with standard JSON serialization.
 * Maps, Sets, Dates, Functions, Symbols, circular references and any custom
 * classes are **not** supported and will result in data and/or functionality loss or errors.
 *
 * @typeParam Output - The runtime type returned after reading/hydration.
 * @typeParam DTO - The internal Data Transfer Object structure.
 * @typeParam Input - The runtime type accepted for writing/dehydration. Defaults to Output.
 */
export interface Spec<Output, DTO, Input = Output> {
	/**
	 * A unique string signature for this spec.
	 *
	 * @remarks
	 * This ID is embedded in the file header. The Codec uses it to verify that the
	 * file being read matches the expected type, preventing accidental data corruption
	 * from type mismatches.
	 */
	id: string;

	/**
	 * The schema version of the spec.
	 *
	 * @remarks
	 * This version is written to the file header. If the version on disk does not match
	 * this version, the `decode` operation will return `null`.
	 */
	version: number;

	/**
	 * Converts the runtime instance into an encodable Data Transfer Object.
	 *
	 * This process strips the "Rich" object down to its persistable state (the DTO).
	 * It prepares the object for storage by extracting the raw data.
	 *
	 * @remarks
	 * **Handling Binary Data:**
	 * Binary fields (Views, Buffers, Blobs, Files) can be included directly or wrapped
	 * in Hints (e.g., `asFile()`) to control how they are stored/restored. The Codec will
	 * automatically detect the supported binary fields, strip them from the JSON structure
	 * and write them as raw binary data.
	 *
	 * **Constraints:**
	 * The DTO structure must be compatible with standard JSON serialization.
	 * Maps, Sets, Dates, Functions, Symbols, circular references and any custom
	 * classes are **not** supported and will result in data and/or functionality
	 * loss or errors.
	 *
	 * @param instance - The object to dehydrate.
	 * @returns The DTO representation of the object.
	 */
	dehydrate: (instance: Input) => Encodable<DTO>;

	/**
	 * Reconstructs the runtime instance from the DTO.
	 *
	 * The `dto` passed here has been fully resolved: binary references have been
	 * replaced with actual instances (Files, Blobs, TypedArrays, Buffers) based on the
	 * serialization logic or hints.
	 *
	 * @param dto - The restored data from disk.
	 * @returns The fully instantiated runtime object.
	 */
	hydrate: (dto: DTO) => Output;
}
