import { concatUint8Arrays } from "~util/TypedArrays";

export async function readableStreamToChunks(
	stream: ReadableStream<Uint8Array>
) {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];

	while (true) {
		const { value, done } = await reader.read();

		if (done) {
			// `value` will be undefined, see https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader/read#return_value
			break;
		}

		chunks.push(value);
	}

	return chunks;
}

/**
 * Reads the readable stream until it is done and returns all chunks as a single blob.
 *
 * @param stream the readable stream
 * @returns the blob
 */
export async function readableStreamToUint8Array(
	stream: ReadableStream<Uint8Array>
) {
	const chunks = await readableStreamToChunks(stream);
	return concatUint8Arrays(chunks);
}

/**
 * Converts a Uint8Array into a ReadableStream.
 *
 * @param {Uint8Array} array The array to convert.s
 * @returns {ReadableStream<Uint8Array>} A readable stream of the array's contents.
 */
export function uint8ArrayToReadableStream(
	array: Uint8Array
): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(array);
			controller.close();
		},
	});
}

/**
 * Reads the readable stream until it is done and returns all chunks as a single blob.
 *
 * @param stream the readable stream
 * @returns the blob
 */
export async function readableStreamToBlob(stream: ReadableStream<Uint8Array>) {
	const chunks = await readableStreamToChunks(stream);
	return new Blob(chunks);
}
