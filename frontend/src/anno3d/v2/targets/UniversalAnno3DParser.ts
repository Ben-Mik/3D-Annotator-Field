import { err, ok } from "neverthrow";
import { type Label } from "~entity/Annotation";
import { uint8ArrayToReadableStream } from "~util/streams/StreamUtils";
import * as AnnotationFileV1 from "../../v1";
import { MAGIC_START as MAGIC_UTF_8_v1 } from "../../v1/Serializer";
import type { Parser, ParserResult } from "../Parser";
import { ParserBinary, type ParserBinaryOptions } from "./binary/ParserBinary";
import { MAGIC_FILE_SIGNATURE as MAGIC_BINARY } from "./binary/SerializerBinary";
import { ParserPng, type ParserPngOptions } from "./png/ParserPng";
import { ParserUtf8 } from "./utf8/ParserUtf8";
import { MAGIC_COMMENT as MAGIC_UTF_8_v2 } from "./utf8/SerializerUtf8";

/**
 * The 8-byte magic signature for PNG files (\x89 P N G \r \n \x1a \n).
 */
const MAGIC_PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Options for the Anno3DParser.
 * This allows passing configuration down to the specific parsers.
 */
export interface Anno3DParserOptions {
	binary?: ParserBinaryOptions;
	png?: ParserPngOptions;
}

/**
 * A universal parser for anno3d.
 *
 * This class acts as a Facade, automatically detecting the file type
 * (binary, UTF-8 v1/v2, or PNG) and delegating the parsing to the
 * appropriate implementation.
 */
export class UniversalAnno3DParser implements Parser {
	private readonly _textDecoder: TextDecoder;
	private readonly _options: Anno3DParserOptions;

	/**
	 * Constructs a new `AnnotationParser`.
	 *
	 * @param options Optional configuration to be passed down to the
	 * specific parsers.
	 */
	constructor(options?: Anno3DParserOptions) {
		this._textDecoder = new TextDecoder("utf-8");
		this._options = options ?? {};
	}

	/**
	 * Parses the contents of a file by auto-detecting its type.
	 *
	 * @param data The contents of the file.
	 * @param labels The application's current list of labels to validate against.
	 * @returns A Promise resolving with a ParserResult.
	 */
	public async parse(
		data: Uint8Array,
		labels: Label[]
	): Promise<ParserResult> {
		const parser = this._getParserForFile(data);

		if (!parser) {
			const result = await this._handleDeprecatedFormats(data, labels);
			if (result != null) {
				return result;
			}

			return err({
				code: "UNKNOWN_FILE_TYPE",
				position: 0,
				message: "Unknown file format.",
			});
		}

		return parser.parse(data, labels);
	}

	/**
	 * Identifies the correct parser for the given file data.
	 *
	 * @param data The raw `Uint8Array` of the file.
	 * @returns The correct `Parser` instance or `null` if not recognized.
	 */
	private _getParserForFile(data: Uint8Array): Parser | null {
		if (
			data.length > MAGIC_PNG.length &&
			MAGIC_PNG.every((byte, i) => data[i] === byte)
		) {
			return new ParserPng(this._options.png);
		}

		if (
			data.length > MAGIC_BINARY.length &&
			this._textDecoder.decode(data.subarray(0, MAGIC_BINARY.length)) ===
				MAGIC_BINARY
		) {
			return new ParserBinary(this._options.binary);
		}

		if (
			data.length > MAGIC_UTF_8_v2.length &&
			this._textDecoder.decode(
				data.subarray(0, MAGIC_UTF_8_v2.length)
			) === MAGIC_UTF_8_v2
		) {
			return new ParserUtf8();
		}

		return null;
	}

	/**
	 * Handles the deprecated UTF-8 v1 file format.
	 *
	 * Runs the parser for matching files and converts the input and output
	 * to the new interfaces.
	 *
	 * @param data The raw `Uint8Array` of the file.
	 * @param labels The application's current list of labels to validate against.
	 * @returns A Promise resolving with a ParserResult or `null` if not recognized.
	 */
	private async _handleDeprecatedFormats(
		data: Uint8Array,
		labels: Label[]
	): Promise<ParserResult | null> {
		if (
			data.length <= MAGIC_UTF_8_v1.length ||
			this._textDecoder.decode(data.subarray(0, MAGIC_UTF_8_v1.length)) !=
				MAGIC_UTF_8_v1
		) {
			return null;
		}

		const stream = uint8ArrayToReadableStream(data);
		const parser = new AnnotationFileV1.ParserUtf8(labels);
		const result = await parser.parse(stream);

		if (result.isOk()) {
			return ok({
				annotations: result.value,
				modelType: "UNKNOWN",
			});
		} else {
			const error = result.error;
			if (error.code === "UNSUPPORTED") {
				const payload = {
					...error.payload,
					expectedVersion: "1.0",
				};
				return err({
					...error,
					position: error.lineNumber,
					payload,
				});
			} else {
				return err({
					...error,
					position: error.lineNumber,
				});
			}
		}
	}
}
