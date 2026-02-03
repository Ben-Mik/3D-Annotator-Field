import type { Path } from "~cache/core/Path";
import type { Chunk } from "~cache/core/Store";
import type { Writer } from "~cache/core/Writer";
import type { OpfsStore } from "./OpfsStore";

/**
 * Base implementation of {@link Writer} for OPFS-backed stores.
 *
 * This class coordinates high-level writer semantics:
 * - Starts writing at byte position `0`.
 * - Tracks closed/aborted/failed state.
 * - Ensures that `abort` attempts to delete the file in the underlying store.
 *
 * Subclasses provide the concrete write/close/abort behavior tied to specific
 * OPFS primitives (for example, `FileSystemWritableFileStream` or
 * `FileSystemSyncAccessHandle`).
 */
export abstract class OpfsWriter implements Writer {
	private readonly _store: OpfsStore;
	private readonly _path: Path;

	private _closedOrAborted = false;
	private _failed = false;

	/**
	 * Create a new OpfsWriter for a specific file.
	 *
	 * @param store - The OPFS store responsible for the file.
	 * @param path - The logical path of the file being written.
	 */
	constructor(store: OpfsStore, path: Path) {
		this._store = store;
		this._path = path;
	}

	/** @inheritdoc */
	public async write(data: Chunk | readonly Chunk[]): Promise<boolean> {
		if (this._closedOrAborted) {
			throw new Error(
				"[AnnotatorCache] Cannot write using a closed or aborted StoreWriter."
			);
		}

		if (this._failed) {
			throw new Error(
				"[AnnotatorCache] Cannot write using a Writer that is in a failed state. Call abort()."
			);
		}

		const chunks = Array.isArray(data) ? data : [data];
		const success = await this._onWrite(chunks);

		if (!success) {
			this._failed = true;
			return false;
		}

		return true;
	}

	/**
	 * Implementation hook for writing one or more chunks to the underlying file.
	 *
	 * This method is called by {@link write} after state checks have been
	 * performed. Implementations should:
	 *
	 * - Start writing at byte position `0` and maintain an internal position.
	 * - Return `true` on success.
	 * - Return `false` for recoverable conditions such as quota limits.
	 * - Throw for unexpected errors that should surface to the caller.
	 *
	 * @param chunks - The data chunks to write.
	 * @returns A promise resolving to `true` on success, `false` on recoverable failure.
	 */
	protected abstract _onWrite(chunks: readonly Chunk[]): Promise<boolean>;

	/** @inheritdoc */
	public async close(): Promise<boolean> {
		if (this._closedOrAborted) {
			throw new Error(
				"[AnnotatorCache] Cannot close a StoreWriter that has already been closed or aborted."
			);
		}

		if (this._failed) {
			await this.abort();
			return false;
		}

		this._closedOrAborted = true;
		return this._onClose();
	}

	/**
	 * Implementation hook for finalizing and closing the underlying file.
	 *
	 * This method is called by {@link close} after state checks have been
	 * performed. Implementations should:
	 *
	 * - Flush and close the underlying handle.
	 * - Ensure that any extra bytes from a previous version of the file are
	 *   truncated, so that only the bytes written through this writer remain.
	 *
	 * @returns A promise resolving to `true` if the file was closed and
	 *          truncated successfully, or `false` if closing failed due to
	 *          a recoverable condition (for example, quota exceeded).
	 */
	protected abstract _onClose(): Promise<boolean>;

	/** @inheritdoc */
	public async abort(): Promise<void> {
		if (this._closedOrAborted) {
			return;
		}

		this._closedOrAborted = true;

		await this._onAbort();
		await this._store.delete(this._path);
	}

	/**
	 * Implementation hook for aborting writes on the underlying file handle.
	 *
	 * This method is called by {@link abort} before the writer attempts to
	 * delete the file via the underlying store. Implementations should close
	 * any open handles and avoid throwing for normal abort flows.
	 *
	 * @returns A promise that resolves once the underlying handle has been closed.
	 */
	protected abstract _onAbort(): Promise<void>;
}
