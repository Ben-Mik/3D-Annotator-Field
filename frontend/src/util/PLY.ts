import { type Prettify } from "./TypeScript";

export type PLYFormat = "ascii" | "binary_le" | "binary_be";

export function isBinaryPLYFormat(format: PLYFormat) {
	return format != "ascii";
}

/**
 * `illegalFile`: The file does not seem to be a ply file
 * `unknown`: The file seems to be a ply file but a correct format header was not found
 */
export type PLYFormatError = "invalidPLYFile" | "unknown";

interface PLYFormatReturnBase {
	stream: ReadableStream<Uint8Array>;
}

interface PLYFormatReturnSuccess {
	format: PLYFormat;
	error: undefined;
}

interface PLYFormatReturnError {
	format: undefined;
	error: PLYFormatError;
}

export type PLYFormatReturn = Prettify<
	PLYFormatReturnBase & (PLYFormatReturnSuccess | PLYFormatReturnError)
>;

export async function parsePLYFormat(
	stream: ReadableStream<Uint8Array>,
	maxPeek = 4096
): Promise<PLYFormatReturn> {
	const [headerStream, returnStream] = stream.tee();

	const headerText = await getHeaderText(headerStream, maxPeek);

	let res: PLYFormatReturnSuccess | PLYFormatReturnError;

	if (!/^ply\s/i.test(headerText)) {
		res = getError("invalidPLYFile");
	} else if (/format\s+ascii\s+1\.0/i.test(headerText)) {
		res = getSuccess("ascii");
	} else if (/format\s+binary_little_endian\s+1\.0/i.test(headerText)) {
		res = getSuccess("binary_le");
	} else if (/format\s+binary_big_endian\s+1\.0/i.test(headerText)) {
		res = getSuccess("binary_be");
	} else {
		res = getError("unknown");
	}

	return {
		stream: returnStream,
		...res,
	};
}

function getSuccess(format: PLYFormat): PLYFormatReturnSuccess {
	return {
		format,
		error: undefined,
	};
}

function getError(error: PLYFormatError): PLYFormatReturnError {
	return {
		format: undefined,
		error,
	};
}

/**
 * Returns the header or the first `maxPeek` bytes of the ply file as text.
 *
 * @param stream the stream to read from, will be closed by the function
 * @param maxPeek the maximum number of bytes to look at
 * @returns the whole header or the first `maxPeek` bytes of the file as text
 */
async function getHeaderText(
	stream: ReadableStream<Uint8Array>,
	maxPeek: number
): Promise<string> {
	const reader = stream.getReader();
	const textDecoder = new TextDecoder("ascii");
	let total = 0;
	let text = "";

	while (total < maxPeek) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}

		total += value.byteLength;
		text += textDecoder.decode(value, { stream: true });
		if (/\bend_header\b/i.test(text)) {
			break;
		}
	}

	text += textDecoder.decode(undefined, { stream: false });
	void reader.cancel();
	return text;
}
