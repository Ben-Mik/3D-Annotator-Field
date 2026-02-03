import type { Reader } from "~cache/core/Reader";
import { isQuotaExceededError } from "~util/fileSystem/OriginPrivateFileSystem";
import type { Path } from "../../core/Path";
import type { Chunk } from "../../core/Store";
import type { Writer } from "../../core/Writer";
import { OpfsReader } from "./OpfsReader";
import { OpfsStore } from "./OpfsStore";
import { OpfsWriter } from "./OpfsWriter";

/**
 * OPFS Store implementation using asynchronous file handles.
 * Suitable for the main thread where synchronous access handles are not available.
 */
export class AsyncOpfsStore extends OpfsStore {
	protected override async _createReader(
		fileHandle: FileSystemFileHandle
	): Promise<Reader> {
		const file = await fileHandle.getFile();
		return Promise.resolve(new AsyncOpfsReader(file));
	}

	/** @inheritdoc */
	protected override async _createWriter(
		path: Path,
		fileHandle: FileSystemFileHandle
	): Promise<Writer> {
		const writable = await fileHandle.createWritable({ mode: "exclusive" });
		return new AsyncOpfsWriter(this, path, writable);
	}
}

/**
 * Concrete Reader implementation using the standard `File`/`Blob` API.
 *
 * This implementation is compatible with the main thread. It relies on
 * `Blob.slice()` and `Blob.arrayBuffer()` to read data.
 */
export class AsyncOpfsReader extends OpfsReader {
	/** @inheritdoc */
	public read(offset = 0, length?: number): Promise<ArrayBuffer> {
		const slice = this.slice(offset, length);
		return slice.arrayBuffer();
	}

	/** @inheritdoc */
	public async readInto(target: Chunk, offset = 0): Promise<number> {
		const slice = this.slice(offset, target.byteLength);

		const tmpBuffer = await slice.arrayBuffer();

		const sourceView = new Uint8Array(tmpBuffer);
		const targetView = ArrayBuffer.isView(target)
			? new Uint8Array(
					target.buffer,
					target.byteOffset,
					target.byteLength
			  )
			: new Uint8Array(target);

		targetView.set(sourceView);

		return sourceView.byteLength;
	}

	/** @inheritdoc */
	public close(): Promise<boolean> {
		// nothing to do
		return Promise.resolve(true);
	}
}

/**
 * OPFS-based implementation of {@link Writer} using
 * {@link FileSystemWritableFileStream}.
 *
 * The writer starts at byte position `0` and writes all chunks sequentially.
 * Existing file content is overwritten and effectively truncated when the
 * writer is successfully closed.
 */
class AsyncOpfsWriter extends OpfsWriter {
	private readonly _writable: FileSystemWritableFileStream;

	/**
	 * Create a new AsyncOpfsWriter instance.
	 *
	 * @param store - The backing OPFS store.
	 * @param path - The logical path of the file being written.
	 * @param writable - The writable file stream obtained from OPFS.
	 */
	constructor(
		store: OpfsStore,
		path: Path,
		writable: FileSystemWritableFileStream
	) {
		super(store, path);
		this._writable = writable;
	}

	/** @inheritdoc */
	protected async _onWrite(chunks: readonly Chunk[]): Promise<boolean> {
		try {
			for (const chunk of chunks) {
				await this._writable.write(this._ensureUnshared(chunk));
			}
			return Promise.resolve(true);
		} catch (error) {
			if (isQuotaExceededError(error)) {
				return Promise.resolve(false);
			}

			throw error;
		}
	}

	/**
	 * Helper to ensure the data is not backed by SharedArrayBuffer.
	 * If it is, it is cloned because FileSystemWritableFileStream
	 * forbids shared memory.
	 */
	private _ensureUnshared(chunk: Chunk): ArrayBuffer | ArrayBufferView {
		let sharedBuffer: SharedArrayBuffer;

		if (chunk instanceof SharedArrayBuffer) {
			sharedBuffer = chunk;
		} else if (
			ArrayBuffer.isView(chunk) &&
			chunk.buffer instanceof SharedArrayBuffer
		) {
			sharedBuffer = chunk.buffer;
		} else {
			return chunk;
		}

		const arrayBuffer = new ArrayBuffer(sharedBuffer.byteLength);
		const view = new Uint8Array(arrayBuffer);
		view.set(new Uint8Array(sharedBuffer));

		return arrayBuffer;
	}

	/** @inheritdoc */
	protected async _onClose(): Promise<boolean> {
		await this._writable.close();
		return true;
	}

	/** @inheritdoc */
	protected _onAbort(): Promise<void> {
		return this._writable.close();
	}
}
