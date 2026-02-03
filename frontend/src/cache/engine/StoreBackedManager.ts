import type { Entry } from "../core/Entry";
import type { Manager } from "../core/Manager";
import type { MetadataIndex } from "../core/MetadataIndex";
import { Path } from "../core/Path";
import type { Resource } from "../core/Resource";
import {
	scopeMatchesFilter,
	type PartialScope,
	type Scope,
} from "../core/Scope";
import type { Session } from "../core/Session";
import type { Store } from "../core/Store";
import { StoreBackedSession } from "./StoreBackedSession";

/**
 * Concrete implementation of the Cache Manager.
 * Orchestrates interaction between the MetadataIndex and the underlying Store.
 *
 * Consistency note:
 * Manager operates on metadata only and does not verify the presence of files in the
 * underlying store for operations such as list or stats. Inconsistent states between
 * store and index may arise under storage quota pressure or external modification,
 * but they are handled gracefully:
 * * Session.read/Session.has will clean up stale metadata or recreate missing entries.
 * * Deletion methods are idempotent and tolerate missing files.
 */
export class StoreBackedManager implements Manager {
	private readonly _store: Store;
	private readonly _index: MetadataIndex;

	/**
	 * @param store - The storage provider.
	 * @param index - The loaded metadata index.
	 */
	constructor(store: Store, index: MetadataIndex) {
		this._store = store;
		this._index = index;
	}

	/** @inheritdoc */
	public createSession<S extends Scope>(scope: S): Session<S> {
		return new StoreBackedSession(scope, this._store, this._index);
	}

	/** @inheritdoc */
	public list(filter?: {
		scope?: PartialScope;
		resource?: Resource<Scope>;
	}): Promise<Entry[]> {
		const all = this._index.getAll();

		const res = all.filter((entry) => {
			if (filter?.resource && entry.resource.id !== filter.resource.id) {
				return false;
			}
			if (!scopeMatchesFilter(entry.scope, filter?.scope)) {
				return false;
			}
			return true;
		});
		return Promise.resolve(res);
	}

	/** @inheritdoc */
	public async stats(filter?: { scope?: PartialScope }): Promise<{
		totalBytes: number;
		entries: number;
		byResource: Record<string, { bytes: number; entries: number }>;
	}> {
		const entries = await this.list({ scope: filter?.scope });

		let totalBytes = 0;
		const byResource: Record<string, { bytes: number; entries: number }> =
			{};

		for (const entry of entries) {
			totalBytes += entry.bytes;
			let bucket = byResource[entry.resource.id];
			if (!bucket) {
				bucket = byResource[entry.resource.id] = {
					bytes: 0,
					entries: 0,
				};
			}
			bucket.bytes += entry.bytes;
			bucket.entries += 1;
		}

		return {
			totalBytes,
			entries: entries.length,
			byResource,
		};
	}

	/** @inheritdoc */
	public async findUnusedSince(
		olderThanMs: number,
		filter?: { scope?: PartialScope }
	): Promise<Entry[]> {
		const entries = await this.list({ scope: filter?.scope });
		const threshold = Date.now() - olderThanMs;

		return entries.filter((entry) => entry.lastAccessedAt < threshold);
	}

	/** @inheritdoc */
	public async deleteEntry(entry: Entry): Promise<void> {
		const path = Path.fromResource(entry.resource, entry.scope);
		await this._store.delete(path);
		const success = await this._index.remove(path);

		if (!success) {
			console.warn(
				`[AnnotatorCache] Failed to persist index after deleting entry for ${path.toString()}`
			);
		}
	}

	/** @inheritdoc */
	public async clearAll(): Promise<void> {
		const entries = await this.list();
		for (const entry of entries) {
			await this.deleteEntry(entry);
		}
	}

	/** @inheritdoc */
	public async clearByScope(scope: PartialScope): Promise<void> {
		const entries = await this.list({ scope });
		for (const entry of entries) {
			await this.deleteEntry(entry);
		}
	}

	/** @inheritdoc */
	public async clearByResource(
		resource: Resource<Scope>,
		scope?: PartialScope
	): Promise<void> {
		const entries = await this.list({ scope, resource });
		for (const entry of entries) {
			await this.deleteEntry(entry);
		}
	}

	/** @inheritdoc */
	public async clearUnusedSince(
		olderThanMs: number,
		scope?: PartialScope
	): Promise<void> {
		const entries = await this.findUnusedSince(olderThanMs, { scope });
		for (const entry of entries) {
			await this.deleteEntry(entry);
		}
	}

	/** @inheritdoc */
	getUsageEstimate(): Promise<{ usage: number; quota: number }> {
		return this._store.getUsageEstimate();
	}
}
