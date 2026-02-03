import type { Entry } from "../core/Entry";
import type { MetadataIndex } from "../core/MetadataIndex";
import { Path } from "../core/Path";
import type { Store } from "../core/Store";

const META_DIR = "meta";
const INDEX_FILE_NAME = "indexV1.json";
const LOCK_NAME = "annotator-cache-index-lock";

const VERSION = 1;

interface IndexFileV1 {
	version: number;
	entries: Entry[];
}

/**
 * Implementation of MetadataIndex that persists the index to the underlying Store.
 * Uses the Web Locks API to ensure safe, atomic Read-Modify-Write operations
 * across multiple threads (Window and Workers).
 */
export class StoreBackedMetadataIndex implements MetadataIndex {
	private readonly _encoder = new TextEncoder();
	private readonly _decoder = new TextDecoder("utf-8", { fatal: true });

	private readonly _path: Path;
	private readonly _store: Store;

	/**
	 * In-memory cache for fast synchronous reads (get/has).
	 * This is "Eventual Consistency". Updates from this thread are reflected immediately.
	 * Updates from other threads are reflected on the next atomic write or explicit load().
	 */
	private readonly _entries: Map<string, Entry>;

	private _isLoaded: boolean;

	/**
	 * @param store - The store where the index file will be persisted.
	 */
	constructor(store: Store) {
		this._store = store;
		this._path = Path.fromNames([META_DIR], INDEX_FILE_NAME);
		this._entries = new Map<string, Entry>();
		this._isLoaded = false;
	}

	/**
	 * Initial load. Reads the file from disk into memory.
	 * Can be called periodically to refresh the view of the cache.
	 */
	public async load(): Promise<void> {
		await navigator.locks.request(
			LOCK_NAME,
			{ mode: "exclusive" },
			async () => {
				const data = await this._readFromDisk();
				this._updateMemory(data);
				this._isLoaded = true;
			}
		);
	}

	private _requireLoaded(): void {
		if (!this._isLoaded) {
			throw new Error(
				"[AnnotatorCache] MetadataIndex used before load() was completed."
			);
		}
	}

	/** @inheritdoc */
	public has(path: Path): boolean {
		this._requireLoaded();

		return this._entries.has(path.toString());
	}

	/** @inheritdoc */
	public get(path: Path): Entry | null {
		this._requireLoaded();

		const entry = this._entries.get(path.toString());
		return entry ? entry : null;
	}

	/** @inheritdoc */
	public getAll(): Entry[] {
		this._requireLoaded();
		return Array.from(this._entries.values());
	}

	/** @inheritdoc */
	public async upsert(entry: Entry): Promise<boolean> {
		this._requireLoaded();

		return this._atomicUpdate((indexMap) => {
			const path = Path.fromResource(entry.resource, entry.scope);
			indexMap.set(path.toString(), entry);
			return true;
		});
	}

	/** @inheritdoc */
	public async remove(path: Path): Promise<boolean> {
		this._requireLoaded();

		return this._atomicUpdate((indexMap) => {
			const existed = indexMap.delete(path.toString());
			return existed;
		});
	}

	/** @inheritdoc */
	public async touch(path: Path, lastAccessedAt: number): Promise<boolean> {
		this._requireLoaded();

		return this._atomicUpdate((indexMap) => {
			const existing = indexMap.get(path.toString());
			if (!existing) {
				throw new Error(
					`[AnnotatorCache] Cannot touch metadata for non-existent entry: ${path.toString()}`
				);
			}

			existing.lastAccessedAt = lastAccessedAt;

			return true;
		});
	}

	/**
	 * The Core Atomic Transaction Loop.
	 *
	 * @param mutate - A function that receives the *fresh* map from disk.
	 *                 It should modify the map and return `true` if changes
	 *                 were made (requiring a write), or `false` if no changes
	 *                 are needed.
	 */
	private async _atomicUpdate(
		mutate: (indexMap: Map<string, Entry>) => boolean
	): Promise<boolean> {
		return navigator.locks.request(
			LOCK_NAME,
			{ mode: "exclusive" },
			async () => {
				try {
					const diskEntries = await this._readFromDisk();

					const entriesMap = new Map<string, Entry>();
					for (const entry of diskEntries) {
						const path = Path.fromResource(
							entry.resource,
							entry.scope
						);
						entriesMap.set(path.toString(), entry);
					}

					const shouldWrite = mutate(entriesMap);

					if (!shouldWrite) {
						this._updateMemory(Array.from(entriesMap.values()));
						return true;
					}

					const newEntries = Array.from(entriesMap.values());
					const success = await this._writeToDisk(newEntries);

					if (success) {
						this._updateMemory(newEntries);
					}

					return success;
				} catch (error) {
					console.error(
						"[AnnotatorCache] Atomic index update failed:",
						error
					);
					return false;
				}
			}
		) as Promise<boolean>;
	}

	/**
	 * Helper: Reads and parses the index file. Returns empty array on error/missing.
	 */
	private async _readFromDisk(): Promise<Entry[]> {
		const data = await this._store.read(this._path);
		if (data === null) {
			return [];
		}

		try {
			const text = this._decoder.decode(data);
			const parsed = JSON.parse(text) as IndexFileV1;

			if (parsed.version !== VERSION) {
				console.warn(
					`[AnnotatorCache] Index version mismatch (Expected ${VERSION}, got ${parsed.version}). Resetting index.`
				);
				return [];
			}
			if (!Array.isArray(parsed.entries)) {
				console.warn(
					"[AnnotatorCache] Index malformed (entries is not an array). Resetting index."
				);
				return [];
			}
			return parsed.entries;
		} catch (error) {
			console.error(
				"[AnnotatorCache] Failed to parse index file. Resetting index.",
				error
			);
			return [];
		}
	}

	/**
	 * Helper: Serializes and writes the index file.
	 */
	private async _writeToDisk(entries: Entry[]): Promise<boolean> {
		const index: IndexFileV1 = { version: VERSION, entries };
		const text = JSON.stringify(index);
		const data = this._encoder.encode(text);
		return this._store.write(this._path, data);
	}

	/**
	 * Helper: Replaces the in-memory cache with new data.
	 */
	private _updateMemory(entries: Entry[]) {
		this._entries.clear();
		for (const entry of entries) {
			const path = Path.fromResource(entry.resource, entry.scope);
			this._entries.set(path.toString(), entry);
		}
	}
}
