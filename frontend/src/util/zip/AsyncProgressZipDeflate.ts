import {
	type AsyncDeflate,
	AsyncZipDeflate,
	type DeflateOptions,
} from "fflate";
import type { Observer } from "~events/Events";

export class AsyncProgressZipDeflate extends AsyncZipDeflate {
	/**
	 * Creates a new AsyncProgressZipDeflate
	 *
	 * @param filename the filename
	 * @param onBytesProcessed 	a callback function, called with the size of the original chunk
	 * 							whenever a chunk has been processed
	 * @param opts options
	 */
	constructor(
		filename: string,
		onBytesProcessed?: Observer<number>,
		opts?: DeflateOptions
	) {
		super(filename, opts);

		// get the private AsyncDeflate of AsyncZipDeflate
		// see https://github.com/101arrowz/fflate/blob/f7873560ad229c22c4b23b06c6a3806ffde77569/src/index.ts#L2992

		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		const innerAsyncDeflate = (this as any).d as AsyncDeflate;

		// spell-checker:ignore ondrain
		const prev = innerAsyncDeflate.ondrain;
		innerAsyncDeflate.ondrain = (n) => {
			onBytesProcessed?.(n);
			prev?.(n);
		};
	}
}
