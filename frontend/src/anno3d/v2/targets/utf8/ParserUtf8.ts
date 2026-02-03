import { err, ok, type Result } from "neverthrow";
import {
	MAX_ANNOTATION_CLASS,
	NEUTRAL_LABEL,
	type AnnotationsLUT,
	type Label,
} from "~entity/Annotation";
import { ModelType } from "~entity/ModelInformation";

import { StreamingLineDecoder } from "~util/encoding/StreamingLineDecoder";
import { assertSoftUnreachable, assertUnreachable } from "~util/TypeScript";
import type {
	Parser,
	ParserData,
	ParserError,
	ParserResult,
	ParsingError,
} from "../../Parser";
import * as SerializerUtf8 from "./SerializerUtf8";

/**
 * Maps a `Uint32` model type string to its `ModelType` enum value.
 *
 * @param modelTypeString The string from the file.
 * @returns The `ModelType` or `null` if invalid.
 */
function getModelTypeFromString(modelTypeString: string): ModelType | null {
	const typedModelTypeString =
		modelTypeString as SerializerUtf8.ModelTypeString;
	switch (typedModelTypeString) {
		case "point_cloud":
			return ModelType.POINT_CLOUD;
		case "mesh":
			return ModelType.MESH;
		case "texture_mesh":
			return ModelType.TEXTURE_MESH;
		default:
			assertSoftUnreachable(typedModelTypeString);
			return null;
	}
}

/**
 * Internal type to manage the parsing state machine.
 */
type ParserState = "START" | "HEADER" | "DATA";

/**
 * Internal type to hold the partially parsed header data.
 */
interface HeaderData {
	version?: string;
	modelType?: ModelType;
	textureWidth?: number;
	textureHeight?: number;
	totalElements?: number;
}

const HEADER_KEY_MAP = {
	version: "version",
	model_type: "modelType",
	total_elements: "totalElements",
	texture_width: "textureWidth",
	texture_height: "textureHeight",
} as const satisfies Record<SerializerUtf8.HeaderKey, keyof HeaderData>;

/**
 * A parser for the "anno3d" v2.0 UTF-8 text file format.
 *
 * This implementation is optimized for memory efficiency. It parses the
 * header, determines the exact size of the required `AnnotationsLUT`,
 * allocates it once, and then fills it by parsing the data section.
 *
 * It is a synchronous, line-by-line state machine.
 */
export class ParserUtf8 implements Parser {
	private readonly _textDecoder: TextDecoder;

	/**
	 * Constructs a new `ParserUtf8`.
	 */
	constructor() {
		this._textDecoder = new TextDecoder("utf-8");
	}

	/**
	 * Parses the contents of a file and validates it against the known labels.
	 *
	 * @param data The contents of the file.
	 * @param labels The current list of labels to validate against.
	 * @returns A Result object containing the parsed data or a ParserError.
	 */
	public parse(data: Uint8Array, labels: Label[]): Promise<ParserResult> {
		try {
			return Promise.resolve(this._parse(data, labels));
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "An unknown error occurred.";
			return Promise.resolve(
				err({
					code: "PARSING_ERROR",
					position: 0,
					message: `Unexpected parser failure: ${message}`,
				})
			);
		}
	}

	/**
	 * Internal parsing logic, wrapped by the public `parse` method.
	 */
	private _parse(data: Uint8Array, labels: Label[]): ParserResult {
		const knownAnnotationClasses = new Set<number>(
			labels.map((label) => label.annotationClass)
		);
		const seenAnnotationClasses = new Set<number>();

		let state: ParserState = "START";
		const header: HeaderData = {};
		let annotations: AnnotationsLUT | null = null;

		let currentLabel: number | null = null;
		let indicesToRead = 0;
		let lineNumber = 0;

		const decoder = new StreamingLineDecoder(data);
		for (const line of decoder) {
			lineNumber++;
			const trimmedLine = line.trim();

			if (trimmedLine.length === 0) {
				continue;
			}

			if (state !== "START" && trimmedLine.startsWith("#")) {
				continue;
			}

			switch (state) {
				case "START": {
					if (trimmedLine === SerializerUtf8.MAGIC_COMMENT) {
						state = "HEADER";
					} else {
						return err({
							code: "UNKNOWN_FILE_TYPE",
							position: lineNumber,
							message: `Invalid file. Expected magic comment "${SerializerUtf8.MAGIC_COMMENT}".`,
						});
					}
					break;
				}

				case "HEADER": {
					if (trimmedLine === SerializerUtf8.DATA_SEPARATOR) {
						// header is complete

						const headerError = this._validateHeader(
							header,
							lineNumber
						);
						if (headerError) {
							return err(headerError);
						}

						const allocationResult = this._allocateLUT(
							header,
							lineNumber
						);
						if (allocationResult.isErr()) {
							return err(allocationResult.error);
						}
						annotations = allocationResult.value;

						state = "DATA";
						continue;
					}

					const parts = trimmedLine.split(":", 2);
					if (parts.length !== 2) {
						return err({
							code: "PARSING_ERROR",
							position: lineNumber,
							message: `Invalid header line. Expected "key: value" format.`,
						});
					}
					const [key, value] = parts.map((p) => p.trim());
					const parseHeaderError = this._parseHeaderField(
						header,
						key,
						value,
						lineNumber
					);
					if (parseHeaderError) {
						return err(parseHeaderError);
					}
					break;
				}

				case "DATA": {
					if (indicesToRead > 0) {
						// this line must be an index
						const error = this._parseIndexLine(
							trimmedLine,
							annotations!,
							currentLabel!,
							lineNumber
						);
						if (error) {
							return err(error);
						}
						indicesToRead--;
					} else {
						// this line must be a "label" directive
						const directiveResult = this._parseLabelDirective(
							trimmedLine,
							knownAnnotationClasses,
							seenAnnotationClasses,
							lineNumber
						);
						if (directiveResult.isErr()) {
							return err(directiveResult.error);
						}

						indicesToRead = directiveResult.value.count;
						currentLabel = directiveResult.value.annotationClass;
					}
					break;
				}
				default:
					assertUnreachable(state);
			}
		}

		if (state !== "DATA" || annotations === null) {
			return err({
				code: "PARSING_ERROR",
				position: lineNumber,
				message: `File ended before "data_start" separator was found.`,
			});
		}
		if (indicesToRead > 0) {
			return err({
				code: "PARSING_ERROR",
				position: lineNumber,
				message: `Truncated file. Expected ${indicesToRead} more indices for label ${currentLabel}.`,
			});
		}

		const parserData = this._createParserData(
			header as Required<HeaderData>,
			annotations
		);
		return ok(parserData);
	}

	/**
	 * Parses a single "key: value" header field and mutates the `header` object.
	 *
	 * @param header The `HeaderData` object to populate.
	 * @param key The key from the file.
	 * @param value The value from the file.
	 * @param position The current line number for error reporting.
	 * @returns A `ParserError` or `null` on success.
	 */
	private _parseHeaderField(
		header: HeaderData,
		key: string,
		value: string,
		position: number
	): ParserError | null {
		const typedKey = key as SerializerUtf8.HeaderKey;
		switch (typedKey) {
			case "version": {
				if (value !== SerializerUtf8.VERSION) {
					return {
						code: "UNSUPPORTED",
						position,
						message: `Unsupported format version. Expected ${SerializerUtf8.VERSION} but got ${value}.`,
						payload: {
							format: "anno3d utf-8",
							version: value,
							expectedVersion: SerializerUtf8.VERSION,
						},
					};
				}
				header.version = value;
				break;
			}

			case "model_type": {
				const modelType = getModelTypeFromString(value);
				if (modelType === null) {
					return {
						code: "UNKNOWN_MODEL_TYPE",
						position,
						message: `Unknown model type: "${value}".`,
						payload: { modelType: value },
					};
				}
				header.modelType = modelType;
				break;
			}

			case "total_elements":
			case "texture_width":
			case "texture_height": {
				const number = parseInt(value, 10);
				if (isNaN(number) || number < 0) {
					return {
						code: "PARSING_ERROR",
						position,
						message: `Invalid value for "${key}": "${value}". Must be a positive integer.`,
					};
				}
				header[HEADER_KEY_MAP[typedKey]] = number;
				break;
			}
			default:
				// warn on unknown key/value pairs
				console.warn(
					`Anno3d utf-8 v2.0 Parser: Found unknown key/value pair in header ("${key}: ${value}")`
				);
				assertSoftUnreachable(typedKey);
		}
		return null;
	}

	/**
	 * Validates the completed `HeaderData` object to ensure all required
	 * fields are present for the specified mode.
	 *
	 * @param header The `HeaderData` object.
	 * @param position The current line number for error reporting.
	 * @returns A `ParserError` or `null` on success.
	 */
	private _validateHeader(
		header: HeaderData,
		position: number
	): ParserError | null {
		if (!header.version) {
			return {
				code: "PARSING_ERROR",
				position,
				message: `Header is missing required "version" field.`,
			};
		}
		if (!header.modelType) {
			return {
				code: "PARSING_ERROR",
				position,
				message: `Header is missing required "mode" field.`,
			};
		}

		switch (header.modelType) {
			case ModelType.TEXTURE_MESH:
				if (
					header.textureWidth === undefined ||
					header.textureHeight === undefined
				) {
					return {
						code: "PARSING_ERROR",
						position,
						message: `Mode "${header.modelType}" requires "texture_width" and "texture_height" fields.`,
					};
				}
				break;
			case ModelType.MESH:
			case ModelType.POINT_CLOUD:
				if (header.totalElements === undefined) {
					return {
						code: "PARSING_ERROR",
						position,
						message: `Mode "${header.modelType}" requires "total_elements" field.`,
					};
				}
				break;
			default:
				assertUnreachable(header.modelType);
		}
		return null;
	}

	/**
	 * Allocates and fills the `AnnotationsLUT` based on the header data.
	 *
	 * @param header The validated `HeaderData` object.
	 * @param position The current line number for error reporting.
	 * @returns A `Result` containing the `AnnotationsLUT` or a `ParsingError`.
	 */
	private _allocateLUT(
		header: HeaderData,
		position: number
	): Result<AnnotationsLUT, ParserError> {
		let size = 0;
		if (header.modelType === ModelType.TEXTURE_MESH) {
			size = header.textureWidth! * header.textureHeight!;
		} else if (
			header.modelType === ModelType.MESH ||
			header.modelType === ModelType.POINT_CLOUD
		) {
			size = header.totalElements!;
		}

		if (size === 0) {
			return err({
				code: "PARSING_ERROR",
				position,
				message: "Total element size is zero. Cannot parse file.",
			});
		}

		const annotations = new Uint8Array(size);
		annotations.fill(NEUTRAL_LABEL.annotationClass);
		return ok(annotations);
	}

	/**
	 * Parses a "label <class> <count>" directive line.
	 *
	 * @param line The trimmed line to parse.
	 * @param knownAnnotationClasses A set of all valid annotation classes.
	 * @param seenAnnotationClasses A set of annotation classes already seen in this file.
	 * @param position The current line number.
	 * @returns A `Result` containing the parsed class and count, or a `ParserError`.
	 */
	private _parseLabelDirective(
		line: string,
		knownAnnotationClasses: Set<number>,
		seenAnnotationClasses: Set<number>,
		position: number
	): Result<{ annotationClass: number; count: number }, ParserError> {
		const parts = line.split(/\s+/); // split by whitespace
		if (parts.length !== 3 || parts[0] !== "label") {
			return err({
				code: "PARSING_ERROR",
				position,
				message: `Invalid label directive. Expected "label <annotation_class> <count>".`,
			});
		}

		const annotationClass = parseInt(parts[1], 10);
		const count = parseInt(parts[2], 10);

		if (
			isNaN(annotationClass) ||
			annotationClass < 0 ||
			annotationClass > MAX_ANNOTATION_CLASS
		) {
			return err({
				code: "PARSING_ERROR",
				position,
				message: `Invalid annotation class: "${parts[1]}". Must be an integer 0-${MAX_ANNOTATION_CLASS}.`,
			});
		}
		if (isNaN(count) || count < 0) {
			return err({
				code: "PARSING_ERROR",
				position,
				message: `Invalid index count: "${parts[2]}". Must be a non-negative integer.`,
			});
		}

		if (seenAnnotationClasses.has(annotationClass)) {
			return err({
				code: "DUPLICATE_LABEL",
				position,
				message: `Duplicate label for annotation class ${annotationClass}.`,
				payload: { annotationClass },
			});
		}
		seenAnnotationClasses.add(annotationClass);

		if (!knownAnnotationClasses.has(annotationClass)) {
			return err({
				code: "UNKNOWN_LABEL",
				position,
				message: `File contains an unknown annotation class: ${annotationClass}.`,
				payload: { annotationClass },
			});
		}

		return ok({ annotationClass, count });
	}

	/**
	 * Parses a single index line and writes it into the `AnnotationsLUT`.
	 *
	 * @param line The trimmed line to parse.
	 * @param annotations The `AnnotationsLUT` to write into.
	 * @param annotationClass The annotation class to write.
	 * @param position The current line number.
	 * @returns A `ParsingError` or `null` on success.
	 */
	private _parseIndexLine(
		line: string,
		annotations: AnnotationsLUT,
		annotationClass: number,
		position: number
	): ParsingError | null {
		const index = parseInt(line, 10);

		if (isNaN(index) || index < 0) {
			return {
				code: "PARSING_ERROR",
				position,
				message: `Invalid index: "${line}". Must be a non-negative integer.`,
			};
		}

		if (index >= annotations.length) {
			return {
				code: "PARSING_ERROR",
				position,
				message: `Index ${index} is out of bounds (max: ${
					annotations.length - 1
				}).`,
			};
		}

		annotations[index] = annotationClass;
		return null;
	}

	/**
	 * Creates the final `ParserData` object from the parsed header and data.
	 *
	 * @param header The fully validated `HeaderData` object.
	 * @param annotations The populated `AnnotationsLUT`.
	 * @returns The final `ParserData` object.
	 */
	private _createParserData(
		header: Required<HeaderData>,
		annotations: AnnotationsLUT
	): ParserData {
		const modelType = header.modelType;
		const base = { annotations };

		if (modelType === ModelType.TEXTURE_MESH) {
			return {
				...base,
				modelType,
				width: header.textureWidth,
				height: header.textureHeight,
			};
		} else {
			return {
				...base,
				modelType,
			};
		}
	}
}
