import type { Chunk } from "./Store";

/**
 * Streaming writer for a single file or cache resource.
 *
 * A Writer always starts writing at byte position `0` and advances its
 * internal position by the number of bytes written. It does not support
 * seeking or random access.
 *
 * Implementations used by higher-level components (such as cache sessions)
 * may perform additional bookkeeping (for example, metadata updates) when
 * the writer is closed or aborted.
 */
export interface Writer {
	/**
	 * Stream one or more chunks into the underlying file.
	 *
	 * The writer always starts at byte position `0` and maintains an internal
	 * write position. Each call to `write` appends data at the current
	 * position and advances that position by the number of bytes written.
	 *
	 * Existing content of the file is overwritten, i.e., any previous data
	 * beyond the total number of bytes written by this writer is truncated
	 * when the writer is successfully closed.
	 *
	 * If a recoverable condition such as a quota limit is encountered,
	 * this method resolves to `false` and the writer enters a failed state.
	 * Callers should typically follow up with {@link Writer.abort}.
	 *
	 * After the writer has entered a failed state, further calls to `write`
	 * are not allowed and should be avoided.
	 *
	 * @param data - The binary chunk or chunks to write.
	 * @returns A promise resolving to `true` on success, or `false` if the
	 *          write failed due to a recoverable condition (for example,
	 *          quota being exceeded).
	 */
	write(data: Chunk | readonly Chunk[]): Promise<boolean>;

	/**
	 * Finalize the file and commit the written data.
	 *
	 * On success:
	 * - The underlying file is flushed and closed.
	 * - Higher-level implementations (such as cache sessions) may update
	 *   associated metadata to reflect the written content.
	 *
	 * On failure, implementations are expected to best-effort delete the file
	 * and any associated metadata so that the resource is treated as not
	 * present.
	 *
	 * After `close` has been called, the writer must not be used again.
	 *
	 * @returns A promise resolving to `true` if the file was committed
	 *          successfully, or `false` if the commit failed (for example,
	 *          because persisting metadata was not possible).
	 */
	close(): Promise<boolean>;

	/**
	 * Abort the write and discard the file's data.
	 *
	 * Both the underlying file and any associated metadata are best-effort
	 * deleted so that the resource is treated as not present after `abort`
	 * completes.
	 *
	 * `abort` is idempotent; calling it multiple times is safe. After calling
	 * `abort`, the writer must not be used again.
	 *
	 * @returns A promise that resolves once cleanup has completed.
	 */
	abort(): Promise<void>;
}
