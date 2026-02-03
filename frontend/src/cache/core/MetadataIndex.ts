import type { Entry } from "./Entry";
import type { Path } from "./Path";

/**
 * Interface for managing the metadata of cached files.
 * Acts as a database for looking up file locations, sizes, and access times.
 */
export interface MetadataIndex {
	/**
	 * Initializes the index (e.g., loads it from disk).
	 */
	load(): Promise<void>;

	/**
	 * Checks whether an entry exists for the given path.
	 *
	 * @param path - The path to test.
	 * @returns `true` if an entry exists for the path, `false` otherwise.
	 */
	has(path: Path): boolean;

	/**
	 * Retrieves an entry corresponding to the given path.
	 * @param path - The path of the cached file.
	 * @returns The entry associated with the given path, or `null` if none exists.
	 */
	get(path: Path): Entry | null;

	/**
	 * Inserts or updates an entry in the index.
	 * @param entry - The entry to save.
	 * @returns A promise resolving to `true` if the entry was persisted successfully,
	 *          `false` if persisting the index failed.
	 */
	upsert(entry: Entry): Promise<boolean>;

	/**
	 * Removes an entry from the index.
	 * @param path - The path associated with the entry to remove.
	 * @returns A promise resolving to `true` if the entry was removed and the index
	 *          was persisted successfully, `false` if persisting the index failed.
	 */
	remove(path: Path): Promise<boolean>;

	/**
	 * Updates the `lastAccessedAt` timestamp for a specific entry.
	 * @param path - The path of the entry.
	 * @param lastAccessedAt - The new timestamp.
	 * @returns A promise resolving to `true` if the metadata update was persisted
	 *          successfully, `false` if persisting the index failed.
	 * @throws {Error} If no entry exists for the given path.
	 */
	touch(path: Path, lastAccessedAt: number): Promise<boolean>;

	/**
	 * Retrieves all entries currently in the index.
	 */
	getAll(): Entry[];
}
