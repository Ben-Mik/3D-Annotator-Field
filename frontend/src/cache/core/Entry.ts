import type { Resource } from "./Resource";
import type { Scope } from "./Scope";

/**
 * Represents a single cached item within the cache.
 * Contains metadata regarding the resource, its scope, and storage metrics.
 */
export interface Entry {
	/**
	 * The resource associated with this entry.
	 */
	resource: Resource<Scope>;

	/**
	 * The scope under which this entry was created.
	 */
	scope: Scope;

	/**
	 * The size of the cached binary data in bytes.
	 */
	bytes: number;

	/**
	 * Timestamp (ms since epoch) when the entry was created.
	 */
	createdAt: number;

	/**
	 * Timestamp (ms since epoch) when the entry was last updated.
	 */
	lastUpdatedAt: number;

	/**
	 * Timestamp (ms since epoch) when the entry was last accessed.
	 *
	 * This timestamp is updated on both successful reads and writes and is
	 * intended for LRU (Least Recently Used) style eviction strategies.
	 */
	lastAccessedAt: number;
}
