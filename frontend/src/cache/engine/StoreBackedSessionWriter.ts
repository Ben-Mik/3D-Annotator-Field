import type { Entry } from "~cache/core/Entry";
import type { MetadataIndex } from "~cache/core/MetadataIndex";
import type { Path } from "~cache/core/Path";
import type { Resource } from "~cache/core/Resource";
import type { Scope } from "~cache/core/Scope";
import type { Chunk, Store } from "~cache/core/Store";
import type { Writer } from "~cache/core/Writer";

/**
 * Session-level wrapper around a Store Writer.
 *
 * This class coordinates the writing process with the metadata index.
 * It tracks the total bytes written and, upon successful closure, creates
 * or updates the corresponding cache entry in the index.
 *
 * It also handles cleanup (deleting the file) if the write is aborted or
 * if the index update fails.
 */
export class StoreBackedSessionWriter implements Writer {
	private readonly _store: Store;
	private readonly _index: MetadataIndex;

	private readonly _resource: Resource<Scope>;
	private readonly _effectiveScope: Scope;
	private readonly _path: Path;

	private readonly _storeWriter: Writer;

	private _totalBytes = 0;
	private _closedOrAborted = false;
	private _failed = false;

	/**
	 * Constructs a new StoreBackedSessionWriter.
	 *
	 * @param store - The store instance.
	 * @param index - The metadata index to update.
	 * @param storeWriter - The underlying writer from the store.
	 * @param resource - The resource definition.
	 * @param effectiveScope - The scope associated with the entry.
	 * @param path - The path being written to.
	 */
	constructor(
		store: Store,
		index: MetadataIndex,
		storeWriter: Writer,
		resource: Resource<Scope>,
		effectiveScope: Scope,
		path: Path
	) {
		this._store = store;
		this._index = index;
		this._storeWriter = storeWriter;
		this._resource = resource;
		this._effectiveScope = effectiveScope;
		this._path = path;
	}

	/** @inheritdoc */
	public async write(data: Chunk | readonly Chunk[]): Promise<boolean> {
		if (this._closedOrAborted) {
			throw new Error(
				"[AnnotatorCache] Cannot write using a closed or aborted Writer."
			);
		}

		if (this._failed) {
			throw new Error(
				"[AnnotatorCache] Cannot write using a Writer that is in a failed state. Call abort()."
			);
		}

		const chunks: readonly Chunk[] = Array.isArray(data) ? data : [data];

		const success = await this._storeWriter.write(chunks);
		if (!success) {
			this._failed = true;
			return false;
		}

		for (const chunk of chunks) {
			this._totalBytes += chunk.byteLength;
		}

		return true;
	}

	/** @inheritdoc */
	public async close(): Promise<boolean> {
		if (this._closedOrAborted) {
			throw new Error(
				"[AnnotatorCache] Cannot close a Writer that has already been closed or aborted."
			);
		}

		if (this._failed) {
			await this.abort();
			return false;
		}

		this._closedOrAborted = true;

		const fileCommitted = await this._storeWriter.close();
		if (!fileCommitted) {
			return this._cleanupClose();
		}

		const now = Date.now();
		const existing = this._index.get(this._path);
		const createdAt = existing?.createdAt ?? now;

		const entry: Entry = {
			resource: this._resource,
			scope: this._effectiveScope,
			bytes: this._totalBytes,
			createdAt,
			lastUpdatedAt: now,
			lastAccessedAt: now,
		};

		const successfulUpsert = await this._index.upsert(entry);
		if (!successfulUpsert) {
			return this._cleanupClose();
		}

		return true;
	}

	/** @inheritdoc */
	public async abort(): Promise<void> {
		if (this._closedOrAborted) {
			return;
		}

		this._closedOrAborted = true;

		await this._storeWriter.abort();
		const removed = await this._index.remove(this._path);
		if (!removed) {
			console.warn(
				`[AnnotatorCache] Failed to persist index after aborting writer for ${this._path.toString()}`
			);
		}
	}

	private async _cleanupClose() {
		await this._store.delete(this._path);

		const removed = await this._index.remove(this._path);
		if (!removed) {
			console.warn(
				`[AnnotatorCache] Failed to persist index after closing writer for ${this._path.toString()}`
			);
		}
		return false;
	}
}
