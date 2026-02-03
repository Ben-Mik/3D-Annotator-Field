import type { Entry } from "~cache/core/Entry";
import type { MetadataIndex } from "~cache/core/MetadataIndex";
import type { Path } from "~cache/core/Path";
import type { Reader } from "~cache/core/Reader";
import type { Chunk, Store } from "~cache/core/Store";

/**
 * Session-level wrapper around a Store Reader.
 *
 * This class acts as a proxy for the underlying store reader while managing
 * metadata updates. Specifically, it ensures that the `lastAccessedAt`
 * timestamp in the metadata index is updated when the reader is closed.
 */
export class StoreBackedSessionReader implements Reader {
	private readonly _storeReader: Reader;

	private readonly _index: MetadataIndex;
	private readonly _store: Store;
	private readonly _path: Path;

	/**
	 * Constructs a new StoreBackedSessionReader.
	 *
	 * @param storeReader - The underlying reader from the store.
	 * @param index - The metadata index to update on close.
	 * @param store - The store instance (used for cleanup if index update fails).
	 * @param path - The path of the resource being read.
	 */
	constructor(
		storeReader: Reader,
		index: MetadataIndex,
		store: Store,
		path: Path
	) {
		this._storeReader = storeReader;
		this._index = index;
		this._store = store;
		this._path = path;
	}

	/** @inheritdoc */
	public get byteLength() {
		return this._storeReader.byteLength;
	}

	/** @inheritdoc */
	public read(offset?: number, length?: number): Promise<ArrayBuffer> {
		return this._storeReader.read(offset, length);
	}

	/** @inheritdoc */
	public readInto(target: Chunk, offset?: number): Promise<number> {
		return this._storeReader.readInto(target, offset);
	}

	/** @inheritdoc */
	public slice(offset?: number, length?: number, mimeType?: string): Blob {
		return this._storeReader.slice(offset, length, mimeType);
	}

	/** @inheritdoc */
	public async close(): Promise<boolean> {
		await this._storeReader.close();

		const now = Date.now();
		const existingEntry = this._index.get(this._path);

		if (existingEntry === null) {
			throw new Error(
				`[AnnotatorCache] Critical: Entry missing from index during reader close for ${this._path.toString()}`
			);
		}

		const entry: Entry = {
			...existingEntry,
			lastAccessedAt: now,
		};

		const successfulUpsert = await this._index.upsert(entry);
		if (!successfulUpsert) {
			await this._store.delete(this._path);

			const removed = await this._index.remove(this._path);
			if (!removed) {
				console.warn(
					`[AnnotatorCache] Failed to persist index after closing writer for ${this._path.toString()}`
				);
			}
			return false;
		}

		return true;
	}
}
