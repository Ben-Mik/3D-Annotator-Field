const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
const ASCII_CR = 13;

/**
 * A memory-efficient utility to read a large Uint8Array line by line.
 *
 * This class implements the standard iterable protocol, allowing you to
 * use it in `for...of` loops. It decodes the byte array in manageable
 * chunks, avoiding the creation of giant strings that can exceed JavaScript's
 * string size limit or cause out of memory errors.
 *
 * It correctly handles `\n` and `\r\n` line endings, as well as
 * multi-byte UTF-8 characters that are split across chunk boundaries.
 */
export class StreamingLineDecoder {
	private readonly _data: Uint8Array;
	private readonly _decoder: TextDecoder;
	private readonly _chunkSize: number;

	/**
	 * Creates a new StreamingLineDecoder.
	 *
	 * @param data The raw `Uint8Array` buffer of the file.
	 * @param options
	 * @param options.chunkSize The size, in bytes, of the chunks to read.
	 * A larger size is often faster but uses more memory for the intermediate
	 * text buffer. Defaults to 8MB.
	 */
	constructor(data: Uint8Array, options?: { chunkSize?: number }) {
		this._data = data;
		this._decoder = new TextDecoder("utf-8");
		this._chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
	}

	/**
	 * Implementation of the iterable protocol.
	 * This allows the use of the class in a `for...of` loop.
	 *
	 * @example
	 * for (const line of new StreamingLineDecoder(data)) {
	 * // process one line at a time
	 * }
	 */
	public [Symbol.iterator](): Iterator<string> {
		return this._lineIterator();
	}

	/**
	 * The core generator function that yields lines one by one.
	 */
	private *_lineIterator(): Generator<string> {
		let position = 0;

		// holds "leftover" text from the previous chunk (the last partial line)
		let leftover = "";

		while (position < this._data.length) {
			const chunkEnd = Math.min(
				position + this._chunkSize,
				this._data.length
			);

			const isLastChunk = chunkEnd === this._data.length;

			const byteChunk = this._data.subarray(position, chunkEnd);

			const textChunk = this._decoder.decode(byteChunk, {
				stream: !isLastChunk,
			});

			position = chunkEnd;

			let searchPos = 0;
			const firstNewline = textChunk.indexOf("\n");

			if (firstNewline === -1) {
				// no newline in this entire chunk
				leftover += textChunk;
				continue;
			}

			const endOfFirstLine = this._getLineEndIndex(
				textChunk,
				firstNewline,
				0
			);
			const firstLineFragment = textChunk.substring(0, endOfFirstLine);

			yield leftover + firstLineFragment;

			leftover = "";

			searchPos = firstNewline + 1;

			let newlineIndex = 0;
			while ((newlineIndex = textChunk.indexOf("\n", searchPos)) !== -1) {
				const endOfLine = this._getLineEndIndex(
					textChunk,
					newlineIndex,
					searchPos
				);

				yield textChunk.substring(searchPos, endOfLine);

				searchPos = newlineIndex + 1;
			}

			leftover = textChunk.substring(searchPos);
		}

		// After the main loop, `leftover` may contain a final line,
		// without a trailing \n. We yield it exactly as-is.
		if (leftover.length > 0) {
			yield leftover;
		}
	}

	/**
	 * Finds the true end-of-line index by checking for a preceding `\r`.
	 *
	 * @param buffer The string buffer being searched.
	 * @param newlineIndex The index of the `\n` character.
	 * @param searchPosition The starting index of the line (for boundary checks).
	 * @returns The correct index for `substring` to slice the line content.
	 */
	private _getLineEndIndex(
		buffer: string,
		newlineIndex: number,
		searchPosition: number
	): number {
		if (
			newlineIndex > searchPosition &&
			buffer.charCodeAt(newlineIndex - 1) === ASCII_CR
		) {
			return newlineIndex - 1;
		}
		return newlineIndex;
	}
}
