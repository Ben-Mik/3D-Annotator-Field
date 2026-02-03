/**
 * Interface to be implemented by classes that handle their own cache persistence.
 *
 * Implementing this interface allows a class to encapsulate its logic,
 * granting access to private properties that external codecs cannot see.
 *
 * `ArrayBufferView` instances are supported out of the box without the need for serialization
 * or reconstruction. The view's content will be written as a raw binary blob and reconstructed
 * into the correct view before hydration. The views should be typed as the specific
 * `TypedArray` or `DataView` you intend to use (e.g., `Float32Array`).
 *
 * **Constraints:**
 * The DTO structure must be compatible with standard JSON serialization.
 * Maps, Sets, Dates, Functions, Symbols, ArrayBuffers, circular references and any custom
 * classes are **not** supported and will result in data and/or functionality loss or errors.
 *
 * @typeParam DTO - The Data Transfer Object structure.
 */
export interface Cacheable<DTO> {
	/**
	 * Dehydrates the instance into a Data Transfer Object.
	 *
	 * This strips the "Rich" object down to its "Dry" state (the DTO).
	 * The DTO should contain the necessary state (including TypedArrays)
	 * to reconstruct this instance later.
	 *
	 *  **Constraints:**
	 * The DTO structure must be compatible with standard JSON serialization.
	 * Maps, Sets, Dates, Functions, Symbols, ArrayBuffers, circular references
	 * and any custom classes are **not** supported and will result in data and/or
	 * functionality loss or errors.
	 */
	dehydrate(): DTO;
}

/**
 * Interface representing the static side of a `Cacheable` class.
 *
 * This contract ensures the class provides the necessary configuration and factory
 * methods to be used with `createCacheCodecFromClass()`.
 */
export interface CacheableClass<T, DTO> {
	/**
	 * Configuration metadata for the codec.
	 */
	readonly CACHE_CODEC_CONFIG: {
		/** Unique signature to prevent type mismatches. */
		readonly id: string;
		/** Schema version. */
		readonly version: number;
	};

	/**
	 * Reconstructs an instance from the dry DTO.
	 *
	 * @param dto - The restored data from disk. TypedArray fields are fully restored.
	 * @returns A new instance of the class.
	 */
	hydrate(dto: DTO): T;
}
