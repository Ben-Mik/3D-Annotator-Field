import { err, ok, type Result } from "neverthrow";
import { type AnnotationsLUT, type Label } from "~entity/Annotation";
import { ModelType } from "~entity/ModelInformation";
import { assertSoftUnreachable, assertUnreachable } from "~util/TypeScript";
import type {
	Parser,
	ParserData,
	ParserError,
	ParserResult,
} from "../../Parser";
import * as SerializerBinary from "./SerializerBinary";

const LITTLE_ENDIAN = SerializerBinary.LITTLE_ENDIAN;

/**
 * Internal interface to hold the parsed data from the "HEAD" chunk.
 */
interface HeadChunkData {
	mode: ModelType;
	width: number;
	height: number;
	neutralClass: number;
}

/**
 * Maps a `Uint32` model type ID to its `ModelType` enum value.
 *
 * @param modelTypeId The ID from the file.
 * @returns The `ModelType` or `null` if invalid.
 */
function getModelTypeFromId(modelTypeId: number): ModelType | null {
	const typedModelTypeId = modelTypeId as SerializerBinary.ModelTypeId;
	switch (typedModelTypeId) {
		case 0:
			return ModelType.POINT_CLOUD;
		case 1:
			return ModelType.MESH;
		case 2:
			return ModelType.TEXTURE_MESH;
		default:
			assertSoftUnreachable(typedModelTypeId);
			return null;
	}
}

/**
 * Options to configure the behavior of the `ParserBinary`.
 */
export interface ParserBinaryOptions {
	/**
	 * If `true`, the returned `annotations` `Uint8Array` will be a *view*
	 * into the original `file.data` `ArrayBuffer`. This is extremely memory
	 * efficient as it avoids copying the largest part of the file.
	 *
	 * If `false`, a new `ArrayBuffer` will be allocated and the
	 * annotation data will be copied into it.
	 *
	 * @default false
	 */
	inPlace?: boolean;

	/**
	 * If `true`, skips the expensive validation pass over the entire
	 * `DATA` chunk. This improves performance but risks missing
	 * `InconsistentLabelsError` or `UnknownLabelError` errors.
	 *
	 * @default false
	 */
	skipValidation?: boolean;
}

/**
 * A parser for the "anno3d" v2.0 binary file format.
 *
 * This class implements the `Parser` interface. It is designed to be
 * highly memory-efficient by parsing the file in-place and offering
 * options to return a view of the original buffer.
 */
export class ParserBinary implements Parser {
	private readonly _textDecoder: TextDecoder;
	private readonly _inPlace: boolean;
	private readonly _skipValidation: boolean;

	/**
	 * Constructs a new `ParserBinary`.
	 *
	 * @param options Optional configuration for the parser.
	 */
	constructor(options?: ParserBinaryOptions) {
		this._textDecoder = new TextDecoder("utf-8");
		this._inPlace = options?.inPlace ?? false;
		this._skipValidation = options?.skipValidation ?? false;
	}

	/**
	 * Parses the contents of a binary file and validates it against the
	 * known labels.
	 *
	 * @param data The content of the file.
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
		if (data.byteLength < SerializerBinary.FILE_HEADER_SIZE) {
			return err({
				code: "PARSING_ERROR",
				position: 0,
				message: "File is truncated. Unable to read file header.",
			});
		}

		const view = new DataView(
			data.buffer,
			data.byteOffset,
			data.byteLength
		);

		const headerError = this._validateFileHeader(data, view);
		if (headerError) {
			return err(headerError);
		}

		const knownAnnotationClasses = new Set<number>(
			labels.map((label) => label.annotationClass)
		);

		let head: HeadChunkData | null = null;
		let clstChunk: Uint8Array | null = null;
		let dataChunkLocation: { offset: number; length: number } | null = null;

		let offset = SerializerBinary.FILE_HEADER_SIZE;
		while (offset < view.byteLength) {
			if (offset + SerializerBinary.CHUNK_HEADER_SIZE > view.byteLength) {
				return err({
					code: "PARSING_ERROR",
					position: offset,
					message: "File is truncated. Incomplete chunk header.",
				});
			}

			const chunkId = this._textDecoder.decode(
				data.subarray(offset, offset + 4)
			);
			const dataLength = Number(
				view.getBigUint64(offset + 8, LITTLE_ENDIAN)
			);
			const chunkPayloadOffset =
				offset + SerializerBinary.CHUNK_HEADER_SIZE;
			const nextChunkOffset = chunkPayloadOffset + dataLength;

			if (nextChunkOffset > view.byteLength) {
				return err({
					code: "PARSING_ERROR",
					position: offset,
					message: `Chunk "${chunkId}" (at offset ${offset}) reports length ${dataLength} which exceeds file boundary.`,
				});
			}

			const typedChunkId = chunkId as SerializerBinary.ChunkID;
			switch (typedChunkId) {
				case SerializerBinary.HEAD_CHUNK_ID: {
					if (head) {
						return err({
							code: "PARSING_ERROR",
							position: offset,
							message: `Duplicate "HEAD" chunk found.`,
						});
					}
					const expectedSize =
						SerializerBinary.HEAD_CHUNK_PAYLOAD_SIZE;
					if (dataLength !== expectedSize) {
						return err({
							code: "PARSING_ERROR",
							position: offset,
							message: `"HEAD" chunk has invalid length. Expected ${expectedSize}, got ${dataLength}.`,
						});
					}
					const headResult = this._parseHeadChunk(
						view,
						chunkPayloadOffset
					);
					if (headResult.isErr()) {
						return err(headResult.error);
					}
					head = headResult.value;
					break;
				}

				case SerializerBinary.DATA_CHUNK_ID: {
					if (dataChunkLocation) {
						return err({
							code: "PARSING_ERROR",
							position: offset,
							message: `Duplicate "DATA" chunk found.`,
						});
					}
					dataChunkLocation = {
						offset: chunkPayloadOffset,
						length: dataLength,
					};
					break;
				}

				case SerializerBinary.CLST_CHUNK_ID: {
					if (clstChunk) {
						return err({
							code: "PARSING_ERROR",
							position: offset,
							message: `Duplicate "CLST" chunk found.`,
						});
					}
					clstChunk = data.subarray(
						chunkPayloadOffset,
						nextChunkOffset
					);
					break;
				}

				default:
					// warn on unknown chunk header
					console.warn(
						`Anno3d binary v2.0 Parser: Found unknown chunk id ("${chunkId}")`
					);
					assertSoftUnreachable(typedChunkId);
			}

			offset = nextChunkOffset;
		}

		if (!head) {
			return err({
				code: "PARSING_ERROR",
				position: 0,
				message: `File is incomplete. Required "HEAD" chunk not found.`,
			});
		}
		if (!dataChunkLocation) {
			return err({
				code: "PARSING_ERROR",
				position: 0,
				message: `File is incomplete. Required "DATA" chunk not found.`,
			});
		}

		const clstSet = new Set<number>(clstChunk ?? []);

		if (clstSet.has(head.neutralClass)) {
			return err({
				code: "INVALID_NEUTRAL_LABEL",
				position: 0, // Not tied to a specific offset
				message: `The neutral annotation class (${head.neutralClass}) is also listed in the "CLST" chunk of active classes.`,
				payload: { annotationClass: head.neutralClass },
			});
		}

		for (const annotationClass of clstSet) {
			if (!knownAnnotationClasses.has(annotationClass)) {
				return err({
					code: "UNKNOWN_LABEL",
					position: 0, // Not tied to a specific offset
					message: `File contains unknown annotation class ${annotationClass} (from "CLST" chunk).`,
					payload: { annotationClass },
				});
			}
		}

		const annotations = this._inPlace
			? data.subarray(
					dataChunkLocation.offset,
					dataChunkLocation.offset + dataChunkLocation.length
			  )
			: data.slice(
					dataChunkLocation.offset,
					dataChunkLocation.offset + dataChunkLocation.length
			  );

		if (!this._skipValidation) {
			const validationError = this._validateDataChunk(
				annotations,
				head.neutralClass,
				clstChunk,
				clstSet,
				knownAnnotationClasses
			);
			if (validationError) {
				return err(validationError);
			}
		}

		const parserData = this._createParserData(head, annotations);
		return ok(parserData);
	}

	/**
	 * Validates the 16-byte File Header.
	 *
	 * @param data The raw `Uint8Array` for string decoding.
	 * @param view The `DataView` for number reading.
	 * @returns A `ParserError` or `null` on success.
	 */
	private _validateFileHeader(
		data: Uint8Array,
		view: DataView
	): ParserError | null {
		const magic = this._textDecoder.decode(data.subarray(0, 8));
		if (magic !== SerializerBinary.MAGIC_FILE_SIGNATURE) {
			return {
				code: "UNKNOWN_FILE_TYPE",
				position: 0,
				message: `Invalid file signature. Expected "${SerializerBinary.MAGIC_FILE_SIGNATURE}" but got "${magic}".`,
			};
		}

		const major = view.getUint8(8);
		const minor = view.getUint8(9);
		const version = `${major}.${minor}`;

		const expectedMajor = SerializerBinary.MAJOR_VERSION;
		const expectedMinor = SerializerBinary.MINOR_VERSION;
		const expectedVersion = `${expectedMajor}.${expectedMinor}`;

		if (major !== expectedMajor || minor !== expectedMinor) {
			return {
				code: "UNSUPPORTED",
				position: 8,
				message: `Unsupported format version. Expected v${expectedVersion} but got v${version}.`,
				payload: {
					format: "anno3d binary",
					version,
					expectedVersion,
				},
			};
		}

		return null;
	}

	/**
	 * Parses the 16-byte payload of the "HEAD" chunk.
	 *
	 * @param view The `DataView` for the whole file.
	 * @param offset The start offset of the "HEAD" payload.
	 * @returns A `Result` containing the `HeadChunkData` or an `UnknownModelTypeError`.
	 */
	private _parseHeadChunk(
		view: DataView,
		offset: number
	): Result<HeadChunkData, ParserError> {
		const modeId = view.getUint32(offset + 0, LITTLE_ENDIAN);
		const width = view.getUint16(offset + 4, LITTLE_ENDIAN);
		const height = view.getUint16(offset + 6, LITTLE_ENDIAN);
		const neutralClass = view.getUint8(offset + 8);

		const mode = getModelTypeFromId(modeId);
		if (mode === null) {
			return err({
				code: "UNKNOWN_MODEL_TYPE",
				position: offset,
				message: `Unknown model type ID: ${modeId}.`,
				payload: { modelType: modeId },
			});
		}

		return ok({ mode, width, height, neutralClass });
	}

	/**
	 * Performs the expensive `O(n)` scan of the `DATA` chunk payload.
	 *
	 * @param annotations The `AnnotationsLUT` to scan.
	 * @param neutralClass The neutral annotation class from the "HEAD" chunk.
	 * @param clstChunk The "CLST" chunk payload, or `null` if it was missing.
	 * @param clstSet A `Set` of annotation classes from the "CLST" chunk.
	 * @param knownClasses A `Set` of the known annotation classes.
	 * @returns A `ParserError` or `null` on success.
	 */
	private _validateDataChunk(
		annotations: AnnotationsLUT,
		neutralClass: number,
		clstChunk: Uint8Array | null,
		clstSet: Set<number>,
		knownClasses: Set<number>
	): ParserError | null {
		const checkedDataClasses = new Set<number>();

		for (let i = 0; i < annotations.length; i++) {
			const annotationClass = annotations[i];

			// Skip neutral and already-checked classes
			if (
				annotationClass === neutralClass ||
				checkedDataClasses.has(annotationClass)
			) {
				continue;
			}

			checkedDataClasses.add(annotationClass);

			if (clstChunk) {
				if (!clstSet.has(annotationClass)) {
					return {
						code: "INCONSISTENT_LABELS",
						position: i, // Position within the DATA chunk
						message: `DATA chunk contains annotation class ${annotationClass} which is not in "CLST" chunk.`,
						payload: { annotationClass },
					};
				}
			} else {
				if (!knownClasses.has(annotationClass)) {
					return {
						code: "UNKNOWN_LABEL",
						position: i,
						message: `DATA chunk contains annotation class ${annotationClass} which is not in label list (and no "CLST" chunk was provided).`,
						payload: { annotationClass },
					};
				}
			}
		}
		return null;
	}

	/**
	 * Creates the final `ParserData` object from the parsed header and data.
	 *
	 * @param head The parsed `HeadChunkData`.
	 * @param annotations The `AnnotationsLUT`.
	 * @returns The final `ParserData` object.
	 */
	private _createParserData(
		head: HeadChunkData,
		annotations: AnnotationsLUT
	): ParserData {
		const base = { annotations };

		switch (head.mode) {
			case ModelType.TEXTURE_MESH:
				return {
					...base,
					modelType: ModelType.TEXTURE_MESH,
					width: head.width,
					height: head.height,
				};
			case ModelType.MESH:
				return {
					...base,
					modelType: ModelType.MESH,
				};
			case ModelType.POINT_CLOUD:
				return {
					...base,
					modelType: ModelType.POINT_CLOUD,
				};
			default:
				assertUnreachable(head.mode);
		}
	}
}
