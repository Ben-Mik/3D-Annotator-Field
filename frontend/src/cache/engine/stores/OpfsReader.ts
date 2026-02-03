import type { Reader } from "~cache/core/Reader";
import type { CacheChunk } from "~cache/index";

/**
 * Abstract base class for OPFS-based Readers.
 *
 * Holds a reference to the source `File` object to support zero-copy
 * slicing operations across both Sync and Async implementations.
 */
export abstract class OpfsReader implements Reader {
	public readonly byteLength: number;

	protected readonly _file: File;

	/**
	 * @param file - The source File object from the OPFS file handle.
	 */
	constructor(file: File) {
		this._file = file;
		this.byteLength = file.size;
	}

	/** @inheritdoc */
	public abstract read(
		offset?: number,
		length?: number
	): Promise<ArrayBuffer>;

	/** @inheritdoc */
	public abstract readInto(
		target: CacheChunk,
		offset?: number
	): Promise<number>;

	/** @inheritdoc */
	public abstract close(): Promise<boolean>;

	/** @inheritdoc */
	public slice(offset = 0, size?: number, mimeType?: string): Blob {
		const end = size ? offset + size : undefined;
		return this._file.slice(offset, end, mimeType);
	}
}
