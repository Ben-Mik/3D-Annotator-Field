/**
 * Adapts a FileSystemWritableFileStream to a simple writer interface.
 * Automatically handles SharedArrayBuffers by streaming them in chunks to save memory.
 */
export class FileHandleWriter {
	private readonly _stream: FileSystemWritableFileStream;

	// 16MB allows for high throughput with minimal IPC overhead
	private static readonly CHUNK_SIZE = 16 * 1024 * 1024;

	constructor(stream: FileSystemWritableFileStream) {
		this._stream = stream;
	}

	async write(buffer: ArrayBuffer | ArrayBufferView): Promise<number> {
		if (this._isShared(buffer)) {
			return this._writeSharedChunked(buffer);
		}

		await this._stream.write(buffer);
		return buffer.byteLength;
	}

	async close(): Promise<void> {
		await this._stream.close();
	}

	private _isShared(buffer: ArrayBuffer | ArrayBufferView): boolean {
		if (buffer instanceof SharedArrayBuffer) {
			return true;
		}
		if (
			ArrayBuffer.isView(buffer) &&
			buffer.buffer instanceof SharedArrayBuffer
		) {
			return true;
		}
		return false;
	}

	private async _writeSharedChunked(
		source: ArrayBuffer | ArrayBufferView
	): Promise<number> {
		const sourceView = ArrayBuffer.isView(source)
			? new Uint8Array(
					source.buffer,
					source.byteOffset,
					source.byteLength
			  )
			: new Uint8Array(source);

		let offset = 0;
		const totalSize = sourceView.byteLength;

		const scratchBuffer = new ArrayBuffer(FileHandleWriter.CHUNK_SIZE);
		const scratchView = new Uint8Array(scratchBuffer);

		while (offset < totalSize) {
			const remaining = totalSize - offset;
			const currentChunkSize = Math.min(
				remaining,
				FileHandleWriter.CHUNK_SIZE
			);

			scratchView.set(
				sourceView.subarray(offset, offset + currentChunkSize)
			);

			const writeView = scratchView.subarray(0, currentChunkSize);

			await this._stream.write(writeView);

			offset += currentChunkSize;
		}

		return totalSize;
	}
}
