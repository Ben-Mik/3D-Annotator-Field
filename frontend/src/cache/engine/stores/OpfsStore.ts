import type { Reader } from "~cache/core/Reader";
import {
	getOpfsRoot,
	getOpfsUsageEstimate,
	isNotFoundError,
} from "~util/fileSystem/OriginPrivateFileSystem";
import type { Path } from "../../core/Path";
import type { Chunk, Store } from "../../core/Store";
import type { Writer } from "../../core/Writer";

/**
 * Abstract base class for Stores backed by the Origin Private File System (OPFS).
 * Handles directory traversal and handle acquisition, delegating read/write logic to subclasses.
 */
export abstract class OpfsStore implements Store {
	/** @inheritdoc */
	public async has(path: Path): Promise<boolean> {
		const fileHandle = await this._getFileHandle(path, false);

		if (fileHandle === "NOT_FOUND") {
			return false;
		}

		return true;
	}

	/** @inheritdoc */
	public async getFile(path: Path): Promise<File | null> {
		const fileHandle = await this._getFileHandle(path, false);

		if (fileHandle === "NOT_FOUND") {
			return null;
		}

		return fileHandle.getFile();
	}

	/** @inheritdoc */
	public async read(
		path: Path,
		offset?: number,
		length?: number
	): Promise<ArrayBuffer | null> {
		const reader = await this.openReader(path);

		if (reader === null) {
			return null;
		}

		const result = reader.read(offset, length);

		await reader.close();

		return result;
	}

	/** @inheritdoc */
	public async readInto(
		path: Path,
		target: Chunk,
		offset?: number
	): Promise<number | null> {
		const reader = await this.openReader(path);

		if (reader === null) {
			return null;
		}

		const result = reader.readInto(target, offset);

		await reader.close();

		return result;
	}

	public async openReader(path: Path): Promise<Reader | null> {
		const fileHandle = await this._getFileHandle(path, false);

		if (fileHandle === "NOT_FOUND") {
			return null;
		}

		return this._createReader(fileHandle);
	}

	protected abstract _createReader(
		fileHandle: FileSystemFileHandle
	): Promise<Reader>;

	/** @inheritdoc */
	public async write(
		path: Path,
		data: Chunk | readonly Chunk[]
	): Promise<boolean> {
		const chunks = Array.isArray(data) ? data : [data];
		const writer = await this.openWriter(path);
		const success = await writer.write(chunks);
		if (success) {
			return writer.close();
		} else {
			await writer.abort();
			return false;
		}
	}

	/** @inheritdoc */
	public async openWriter(path: Path): Promise<Writer> {
		const fileHandle = await this._getFileHandle(path, true);
		return this._createWriter(path, fileHandle);
	}

	protected abstract _createWriter(
		path: Path,
		fileHandle: FileSystemFileHandle
	): Promise<Writer>;

	/** @inheritdoc */
	public async delete(path: Path): Promise<void> {
		const directoryHandle = await this._getDirectoryHandle(path, false);

		if (directoryHandle === "NOT_FOUND") {
			return;
		}

		try {
			await directoryHandle.removeEntry(path.fileName);
		} catch (error) {
			if (isNotFoundError(error)) {
				return;
			}

			/*
			 * InvalidModificationError indicates a bug or external
			 * modification of the opfs which can not be handled properly
			 * -> throw
			 */

			throw error;
		}
	}

	/** @inheritdoc */
	public async fileSize(path: Path): Promise<number | null> {
		const fileHandle = await this._getFileHandle(path, false);

		if (fileHandle === "NOT_FOUND") {
			return null;
		}
		const file = await fileHandle.getFile();
		return file.size;
	}

	/** @inheritdoc */
	public getUsageEstimate() {
		return getOpfsUsageEstimate();
	}

	private async _getDirectoryHandle(
		path: Path,
		create: true
	): Promise<FileSystemDirectoryHandle>;

	private async _getDirectoryHandle(
		path: Path,
		create: boolean
	): Promise<FileSystemDirectoryHandle | "NOT_FOUND">;

	private async _getDirectoryHandle(
		path: Path,
		create: boolean
	): Promise<FileSystemDirectoryHandle | "NOT_FOUND"> {
		let handle = await getOpfsRoot();
		for (const name of path.directoryNames) {
			try {
				handle = await handle.getDirectoryHandle(name, {
					create,
				});
			} catch (error) {
				if (isNotFoundError(error)) {
					return "NOT_FOUND";
				}

				/*
				 * TypeMismatchError indicates a bug or external
				 * modification of the opfs which can not be handled properly
				 * -> throw
				 */

				throw error;
			}
		}
		return handle;
	}

	private async _getFileHandle(
		path: Path,
		create: true
	): Promise<FileSystemFileHandle>;

	private async _getFileHandle(
		path: Path,
		create: boolean
	): Promise<FileSystemFileHandle | "NOT_FOUND">;

	private async _getFileHandle(
		path: Path,
		create: boolean
	): Promise<FileSystemFileHandle | "NOT_FOUND"> {
		const directoryHandle = await this._getDirectoryHandle(path, create);

		if (directoryHandle === "NOT_FOUND") {
			return "NOT_FOUND";
		}

		let fileHandle: FileSystemFileHandle;
		try {
			fileHandle = await directoryHandle.getFileHandle(path.fileName, {
				create,
			});
		} catch (error) {
			if (isNotFoundError(error)) {
				return "NOT_FOUND";
			}

			/*
			 * TypeMismatchError indicates a bug or external
			 * modification of the opfs which can not be handled properly
			 * -> throw
			 */

			throw error;
		}
		return fileHandle;
	}
}
