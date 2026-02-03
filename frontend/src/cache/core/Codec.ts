import type { Reader } from "./Reader";
import type { Writer } from "./Writer";

/**
 * Represents a component capable of persisting a specific data type to the cache.
 *
 * A Codec handles the bidirectional conversion between a high-level runtime object
 * and a binary stream stored in the cache. It abstracts away the details of
 * serialization format, versioning, and integrity checks.
 *
 * @typeParam Output - The output type returned by `decode` (Reading).
 * @typeParam Input - The input type accepted by `encode` (Writing). Defaults to Output.
 */
export interface Codec<Output, Input = Output> {
	/**
	 * Encodes the object and streams it to the provided Writer.
	 *
	 * @remarks
	 * This method is responsible for serializing the object structure and writing
	 * any associated binary data. It must ensure data is flushed efficiently.
	 *
	 * **Responsibility:**
	 * This method must not close the writer. The caller (e.g., the Session) owns
	 * the writer lifecycle and is responsible for calling `close()` or `abort()`.
	 *
	 * **Error Handling:**
	 * If any call to `writer.write()` returns `false` (indicating a recoverable failure
	 * like quota exceeded), this method must stop writing immediately and return `false`.
	 *
	 * @param data - The runtime object to persist.
	 * @param writer - The cache Writer used to stream the binary data.
	 * @returns A promise resolving to `true` on success, or `false` if the
	 *          write failed due to a recoverable condition (for example,
	 *          quota being exceeded).
	 */
	encode(data: Input, writer: Writer): Promise<boolean>;

	/**
	 * Decodes the stored data into a high-level runtime object.
	 *
	 * @remarks
	 * This method performs efficient extraction. Structural data is parsed, while
	 * binary fields are either read into memory or returned as zero-copy handles
	 * (e.g. `Blob`, `File`) based on the codec's configuration.
	 *
	 * @param reader - The reader handle for the cached file.
	 * @returns The reconstructed runtime object, or `null` if the buffer is corrupted,
	 *          has a type mismatch, or an incompatible version.
	 */
	decode(reader: Reader): Promise<Output | null>;
}
