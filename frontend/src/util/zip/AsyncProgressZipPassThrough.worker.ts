// ESM worker (Vite/Webpack/Rollup can bundle this)
import { ZipPassThrough } from "fflate";
import { assertUnreachable } from "~util/TypeScript";
import type {
	AsyncProgressZipDeflateWorkerReceive,
	AsyncProgressZipDeflateWorkerSend,
} from "./AsyncProgressZipPassThrough";

let zipPassThrough: ZipPassThrough | null = null;

self.onmessage = ({
	data,
}: MessageEvent<AsyncProgressZipDeflateWorkerReceive>) => {
	switch (data.type) {
		case "init": {
			zipPassThrough = new ZipPassThrough(data.fileName);

			zipPassThrough.ondata = (error, chunk, final) => {
				if (error) {
					postMessage<AsyncProgressZipDeflateWorkerSend>({
						type: "error",
						error,
						final,
					});
					return;
				}

				if (final) {
					postMessage<AsyncProgressZipDeflateWorkerSend>({
						type: "meta",
						crc: zipPassThrough!.crc >>> 0,
						size: zipPassThrough!.size >>> 0,
					});
				}

				postMessage<AsyncProgressZipDeflateWorkerSend>(
					{ type: "data", chunk, final },
					{
						transfer: [chunk.buffer],
					}
				);
			};

			return;
		}

		case "push": {
			if (!zipPassThrough) return;

			const length = data.chunk.length;

			zipPassThrough.push(data.chunk, data.final);

			postMessage<AsyncProgressZipDeflateWorkerSend>({
				type: "drain",
				n: length,
			});
			return;
		}

		default: {
			assertUnreachable(data);
		}
	}
};
