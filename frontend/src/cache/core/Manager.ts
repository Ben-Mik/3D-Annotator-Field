import type { Entry } from "./Entry";
import type { Resource } from "./Resource";
import type { PartialScope, Scope } from "./Scope";
import type { Session } from "./Session";

/**
 * High-level interface for managing the cache.
 * Handles lifecycle operations, statistics, cleanup, and session creation.
 */
export interface Manager {
	/**
	 * Creates a new cache session for a specific scope.
	 *
	 * @typeParam S - The type of the scope.
	 * @param scope - The scope definition (e.g., a specific user or project).
	 * @returns A session instance bound to the provided scope.
	 */
	createSession<S extends Scope>(scope: S): Session<S>;

	/**
	 * Lists cache entries matching the provided filter.
	 *
	 * @param filter - Optional criteria to filter entries.
	 * @param filter.scope - Filter by partial scope (e.g., all entries for a specific project).
	 * @param filter.resource - Filter by a specific resource ID.
	 * @returns A promise resolving to an array of matching entries.
	 */
	list(filter?: {
		scope?: PartialScope;
		resource?: Resource<Scope>;
	}): Promise<Entry[]>;

	/**
	 * Retrieves storage statistics, optionally filtered by scope.
	 *
	 * @param filter - Optional criteria to limit statistics.
	 * @param filter.scope - Filter by partial scope (e.g., all entries for a specific project).
	 * @returns A promise resolving to statistics including total bytes, entry count, and breakdown by resource.
	 */
	stats(filter?: { scope?: PartialScope }): Promise<{
		totalBytes: number;
		entries: number;
		byResource: Record<string, { bytes: number; entries: number }>;
	}>;

	/**
	 * Finds entries that have not been accessed within the specified duration.
	 *
	 * @param olderThanMs - The age threshold in milliseconds. Entries accessed before `Date.now() - olderThanMs` are returned.
	 * @param filter - Optional scope filter.
	 * @param filter.scope - Filter by partial scope (e.g., all entries for a specific project).
	 * @returns A promise resolving to the list of "stale" entries.
	 */
	findUnusedSince(
		olderThanMs: number,
		filter?: { scope?: PartialScope }
	): Promise<Entry[]>;

	/**
	 * Deletes a specific entry from the cache and updates the index.
	 *
	 * @param entry - The entry object to delete.
	 */
	deleteEntry(entry: Entry): Promise<void>;

	/**
	 * Clears the entire cache, removing all files and index entries.
	 */
	clearAll(): Promise<void>;

	/**
	 * Removes all entries matching a specific partial scope.
	 *
	 * @param scope - The partial scope to match (e.g., `{ projectId: "123" }`).
	 */
	clearByScope(scope: PartialScope): Promise<void>;

	/**
	 * Removes all entries for a specific resource, optionally restricted to a scope.
	 *
	 * @param resource - The resource identifier.
	 * @param scope - Optional partial scope to refine deletion.
	 */
	clearByResource(
		resource: Resource<Scope>,
		scope?: PartialScope
	): Promise<void>;

	/**
	 * Removes all entries that have not been accessed within the specified duration.
	 *
	 * @param olderThanMs - The age threshold in milliseconds.
	 * @param scope - Optional partial scope to limit the cleanup.
	 */
	clearUnusedSince(olderThanMs: number, scope?: PartialScope): Promise<void>;

	/**
	 * Retrieves an estimate of the current storage usage and available quota.
	 *
	 * Returns the best-effort values provided by the underlying environment. The
	 * numbers are approximate and may not reflect real-time usage immediately.
	 *
	 * @returns A promise resolving to an object containing:
	 * - `usage`: The estimated number of bytes currently used.
	 * - `quota`: The estimated maximum number of bytes available.
	 */
	getUsageEstimate(): Promise<{ usage: number; quota: number }>;
}
