import type { Reader } from "~cache/core/Reader";
import type { SessionToken } from "~cache/core/Runtime";
import type { Entry } from "../core/Entry";
import type { MetadataIndex } from "../core/MetadataIndex";
import { Path } from "../core/Path";
import type {
	InputOfResource,
	OutputOfResource,
	Resource,
	ResourceUsableWithScope,
	TypedResource,
} from "../core/Resource";
import { getEffectiveScopeForKind, type Scope } from "../core/Scope";
import type { Session } from "../core/Session";
import type { Chunk, Store } from "../core/Store";
import type { Writer } from "../core/Writer";
import { StoreBackedSessionReader } from "./StoreBackedSessionReader";
import { StoreBackedSessionWriter } from "./StoreBackedSessionWriter";

/**
 * Concrete implementation of a Session tied to a specific Scope.
 * Handles reading/writing actual file data and updating the index accordingly.
 *
 * @typeParam S - The specific scope for this session.
 */
export class StoreBackedSession<S extends Scope> implements Session<S> {
	/**
	 * Scope this session is bound to.
	 */
	public readonly scope: S;

	private readonly _store: Store;
	private readonly _index: MetadataIndex;

	/**
	 * Create a new scope-bound session.
	 *
	 * @param scope - The scope this session operates within.
	 * @param store - The backing store.
	 * @param index - The metadata index to update on operations.
	 */
	constructor(scope: S, store: Store, index: MetadataIndex) {
		this.scope = scope;
		this._store = store;
		this._index = index;
	}

	/** @inheritdoc */
	get token(): SessionToken<S> {
		return { scope: this.scope };
	}

	/** @inheritdoc */
	public async has<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<boolean> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		const hasBuffer = await this._store.has(path);
		const hasEntry = this._index.has(path);

		if (hasBuffer != hasEntry) {
			console.warn(
				`[AnnotatorCache] Inconsistent cache state for ${path.toString()} (store has file: ${hasBuffer}, metadata has entry: ${hasEntry})`
			);
		}

		return hasBuffer && hasEntry;
	}

	/** @inheritdoc */
	public stats<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<Entry | null> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);
		return Promise.resolve(this._index.get(path));
	}

	/** @inheritdoc */
	public async getFile<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<File | null> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		const file = await this._store.getFile(path);

		if (file === null) {
			await this._cleanupMissingFile(path);
			return null;
		}

		await this._updateMetadataAfterRead(
			path,
			resource,
			effectiveScope,
			file.size
		);

		return file;
	}

	/** @inheritdoc */
	public async readRaw<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<ArrayBuffer | null> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		const buffer = await this._store.read(path);

		if (buffer === null) {
			await this._cleanupMissingFile(path);
			return null;
		}

		await this._updateMetadataAfterRead(
			path,
			resource,
			effectiveScope,
			buffer.byteLength
		);

		return buffer;
	}

	/** @inheritdoc */
	public async readRawInto<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>,
		target: Chunk,
		offset?: number
	): Promise<number | null> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		const bytesRead = await this._store.readInto(path, target, offset);

		if (bytesRead === null) {
			await this._cleanupMissingFile(path);
			return null;
		}

		await this._updateMetadataAfterRead(path, resource, effectiveScope);

		return bytesRead;
	}

	/** @inheritdoc */
	public async openReader<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<Reader | null> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		const storeReader = await this._store.openReader(path);

		if (storeReader === null) {
			return null;
		}

		return new StoreBackedSessionReader(
			storeReader,
			this._index,
			this._store,
			path
		);
	}

	public async read<
		R extends TypedResource<Scope, OutputOfResource<R>, InputOfResource<R>>
	>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<OutputOfResource<R> | null> {
		const reader = await this.openReader(resource);

		if (reader === null) {
			return null;
		}

		const result = await resource.codec.decode(reader);

		await reader.close();

		return result;
	}

	/** @inheritdoc */
	public async writeRaw<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>,
		data: Chunk | readonly Chunk[]
	): Promise<boolean> {
		const writer = await this.openWriter(resource);
		const success = await writer.write(data);

		if (!success) {
			await writer.abort();
			return false;
		}

		return writer.close();
	}

	public async write<
		R extends TypedResource<Scope, OutputOfResource<R>, InputOfResource<R>>
	>(
		resource: ResourceUsableWithScope<R, S>,
		data: InputOfResource<R>
	): Promise<boolean> {
		const writer = await this.openWriter(resource);
		const success = await resource.codec.encode(data, writer);

		if (!success) {
			await writer.abort();
			return false;
		}

		return writer.close();
	}

	/** @inheritdoc */
	public async openWriter<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<Writer> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		const storeWriter = await this._store.openWriter(path);

		return new StoreBackedSessionWriter(
			this._store,
			this._index,
			storeWriter,
			resource,
			effectiveScope,
			path
		);
	}

	/** @inheritdoc */
	public async delete<R extends Resource<Scope>>(
		resource: ResourceUsableWithScope<R, S>
	): Promise<void> {
		const effectiveScope = getEffectiveScopeForKind(
			this.scope,
			resource.scopeKind
		);
		const path = Path.fromResource(resource, effectiveScope);

		await this._store.delete(path);

		const success = await this._index.remove(path);
		if (!success) {
			/*
			 * Persisting the index failed (likely due to quota being exceeded).
			 * This situation is unexpected: A cached file was just deleted, and
			 * the associated metadata entry was removed from memory. In all normal
			 * cases, this reduces or maintains the total storage size, so saving
			 * the index should not fail.
			 *
			 * If this does occur, the cache will remain in an inconsistent state:
			 * The file is gone, but the metadata entry may still reappear. This
			 * state is handled gracefully by `has()` and `read()`.
			 */
			console.warn(
				`[AnnotatorCache] Failed to persist index after deleting ${path.toString()}`
			);
		}
	}

	/**
	 * Helper to handle index updates after a successful read.
	 *
	 * - Touches existing entries.
	 * - Recreates missing entries (recovering from index corruption).
	 */
	private async _updateMetadataAfterRead(
		path: Path,
		resource: Resource<Scope>,
		scope: Scope,
		knownByteLength?: number
	) {
		const existing = this._index.get(path);
		const now = Date.now();

		if (existing) {
			const success = await this._index.touch(path, now);
			if (!success) {
				this._logIndexFailure(path, "touch");
			}
			return;
		}

		// Metadata missing but file exists. Recreate entry.
		console.warn(
			`[AnnotatorCache] Missing metadata entry for existing cache file, recreating entry for ${path.toString()}`
		);

		let bytes = knownByteLength;
		if (bytes === undefined) {
			bytes = (await this._store.fileSize(path)) ?? 0;
		}

		const entry: Entry = {
			resource,
			scope,
			bytes,
			createdAt: now,
			lastUpdatedAt: now,
			lastAccessedAt: now,
		};

		const success = await this._index.upsert(entry);
		if (!success) {
			this._logIndexFailure(path, "upsert");
		}
	}

	/**
	 * Helper to cleanup metadata if the file was not found in the store.
	 */
	private async _cleanupMissingFile(path: Path) {
		if (this._index.has(path)) {
			const success = await this._index.remove(path);
			if (!success) {
				console.warn(
					`[AnnotatorCache] Failed to persist index after deleting metadata for ${path.toString()}`
				);
			}
		}
	}

	private _logIndexFailure(path: Path, operation: string) {
		/*
		 * Persisting the index failed (likely due to quota being exceeded).
		 * This is not critical for correctness: the cached data remains valid,
		 * but the last-access timestamp may be stale, which could cause the
		 * entry to be eligible for eviction earlier than intended.
		 *
		 * The failure will be surfaced to the user when global cache usage
		 * is monitored, so here we only warn.
		 */
		console.warn(
			`[AnnotatorCache] Failed to persist index during '${operation}' for ${path.toString()}. This is non-critical but may affect eviction.`
		);
	}
}
