// spell-checker:ignore Flate

import type {
	AsyncFlateStreamHandler,
	FlateError,
	GzipOptions,
	ZipInputFile,
} from "fflate";
import type { Observer } from "~events/Events";
import { assertUnreachable } from "~util/TypeScript";

export type AsyncProgressZipDeflateWorkerReceive =
	| { type: "init"; fileName: string }
	| { type: "push"; chunk: Uint8Array; final: boolean };

export type AsyncProgressZipDeflateWorkerSend =
	| { type: "meta"; crc: number; size: number }
	| { type: "data"; chunk: Uint8Array; final: boolean }
	| { type: "drain"; n: number }
	| { type: "error"; error: FlateError; final: boolean };

export class AsyncProgressZipPassThrough implements ZipInputFile {
	filename: string;
	crc = 0;
	size = 0;
	compression = 0; // store
	flag?: number;
	os?: number;
	attrs?: number;
	comment?: string;
	extra?: Record<number, Uint8Array>;
	mtime?: GzipOptions["mtime"];
	ondata: AsyncFlateStreamHandler = null!;

	private worker: Worker;

	/**
	 * Creates a new AsyncProgressZipPassThrough
	 *
	 * @param fileName the filename
	 * @param onBytesProcessed 	a callback function, called with the size of the original chunk
	 * 							whenever a chunk has been processed
	 */
	constructor(fileName: string, onBytesProcessed?: Observer<number>) {
		this.filename = fileName;
		this.worker = new Worker(
			new URL("./AsyncProgressZipPassThrough.worker.ts", import.meta.url),
			{ type: "module" }
		);

		this.worker.onerror = (error) => {
			throw new Error(
				`AsyncProgressZipPassThroughWorker: Could not create Web Worker: "${error.message}"`
			);
		};

		this.worker.onmessage = ({
			data,
		}: MessageEvent<AsyncProgressZipDeflateWorkerSend>) => {
			switch (data.type) {
				case "meta": {
					this.crc = data.crc >>> 0; // to 32 bit unsigned integer
					this.size = data.size;
					return;
				}
				case "data": {
					this.ondata?.(null, data.chunk, data.final);
					if (data.final) {
						this.terminate();
					}
					return;
				}
				case "drain": {
					this.size += data.n;
					onBytesProcessed?.(data.n);
					return;
				}
				case "error": {
					this.ondata?.(data.error, new Uint8Array(), data.final);
					return;
				}
				default:
					assertUnreachable(data);
			}
		};

		this.worker.postMessage<AsyncProgressZipDeflateWorkerReceive>({
			type: "init",
			fileName,
		});
	}

	push(chunk: Uint8Array, final?: boolean) {
		if (!this.ondata) {
			throw new Error("ondata has not been attached yet.");
		}
		this.worker.postMessage<AsyncProgressZipDeflateWorkerReceive>(
			{ type: "push", chunk, final: final ?? false },
			[chunk.buffer]
		);
	}

	terminate() {
		try {
			this.worker.terminate();
		} catch (error) {
			throw new Error(
				"AsyncProgressZipPassThroughWorker: Could not terminate Web Worker.",
				{ cause: error }
			);
		}
	}
}
