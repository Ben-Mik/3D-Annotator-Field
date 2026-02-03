import type { Reader } from "~cache/core/Reader";
import { isQuotaExceededError } from "~util/fileSystem/OriginPrivateFileSystem";
import type { Path } from "../../core/Path";
import type { Chunk } from "../../core/Store";
import type { Writer } from "../../core/Writer";
import { OpfsReader } from "./OpfsReader";
import { OpfsStore } from "./OpfsStore";
import { OpfsWriter } from "./OpfsWriter";

/**
 * OPFS Store implementation using synchronous access handles.
 * High-performance implementation, only available within Web Workers.
 */
export class SyncOpfsStore extends OpfsStore {
	protected override async _createReader(
		fileHandle: FileSystemFileHandle
	): Promise<Reader> {
		const file = await fileHandle.getFile();
		const syncAccessHandle = await fileHandle.createSyncAccessHandle();
		return new SyncOpfsReader(file, syncAccessHandle);
	}

	/** @inheritdoc */
	protected override async _createWriter(
		path: Path,
		fileHandle: FileSystemFileHandle
	): Promise<Writer> {
		const syncAccessHandle = await fileHandle.createSyncAccessHandle();
		return new SyncOpfsWriter(this, path, syncAccessHandle);
	}
}

/**
 * Concrete Reader implementation using `FileSystemSyncAccessHandle`.
 *
 * Optimized for synchronous, low-latency access within Web Workers.
 */
export class SyncOpfsReader extends OpfsReader {
	private readonly _syncAccessHandle: FileSystemSyncAccessHandle;

	/**
	 * @param file - The source File object.
	 * @param syncAccessHandle - The open access handle for reading.
	 */
	constructor(file: File, syncAccessHandle: FileSystemSyncAccessHandle) {
		super(file);
		this._syncAccessHandle = syncAccessHandle;
	}

	/** @inheritdoc */
	public read(offset = 0, length = Infinity): Promise<ArrayBuffer> {
		// clamp read bounds to match standard `File.slice` behavior.
		const size = this._syncAccessHandle.getSize();
		const remaining = Math.max(0, size - offset);
		const readSize = Math.min(length, remaining);

		if (readSize === 0) {
			return Promise.resolve(new ArrayBuffer(0));
		}

		const buffer = new ArrayBuffer(readSize);
		this._syncAccessHandle.read(buffer, { at: offset });
		return Promise.resolve(buffer);
	}

	/** @inheritdoc */
	public readInto(target: Chunk, offset?: number): Promise<number> {
		// @ts-expect-error - Types are incorrect: `read` accepts SharedArrayBuffer
		const bytesRead = this._syncAccessHandle.read(target, { at: offset });
		return Promise.resolve(bytesRead);
	}

	/** @inheritdoc */
	public close(): Promise<boolean> {
		this._syncAccessHandle.close();
		return Promise.resolve(true);
	}
}

/**
 * OPFS-based implementation of {@link Writer} using
 * {@link FileSystemSyncAccessHandle}.
 *
 * The writer starts at byte position `0` and writes all chunks sequentially,
 * tracking the total number of bytes written so the file can be truncated
 * exactly to that length on close.
 */
class SyncOpfsWriter extends OpfsWriter {
	private readonly _handle: FileSystemSyncAccessHandle;
	private _bytesWritten: number;

	/**
	 * Create a new SyncOpfsWriter instance.
	 *
	 * @param store - The backing OPFS store.
	 * @param path - The logical path of the file being written.
	 * @param handle - The synchronous access handle obtained from OPFS.
	 */
	constructor(
		store: OpfsStore,
		path: Path,
		handle: FileSystemSyncAccessHandle
	) {
		super(store, path);
		this._handle = handle;
		this._bytesWritten = 0;
	}

	/** @inheritdoc */
	protected _onWrite(chunks: readonly Chunk[]): Promise<boolean> {
		try {
			for (const chunk of chunks) {
				// @ts-expect-error Types are incorrect: `write` accepts SharedArrayBuffer
				this._bytesWritten += this._handle.write(chunk);
			}
			return Promise.resolve(true);
		} catch (error) {
			if (isQuotaExceededError(error)) {
				return Promise.resolve(false);
			}

			throw error;
		}
	}

	/** @inheritdoc */
	protected _onClose(): Promise<boolean> {
		try {
			this._handle.truncate(this._bytesWritten);
		} catch (error) {
			/*
			 * This should not normally happen; if it does, treat it
			 * as a recoverable failure and signal it to the caller.
			 */
			if (isQuotaExceededError(error)) {
				this._handle.close();
				return Promise.resolve(false);
			}
		}

		this._handle.flush();
		this._handle.close();
		return Promise.resolve(true);
	}

	/** @inheritdoc */
	protected _onAbort(): Promise<void> {
		this._handle.close();
		return Promise.resolve();
	}
}
