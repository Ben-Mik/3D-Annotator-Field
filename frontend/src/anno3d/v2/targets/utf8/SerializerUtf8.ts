import {
	MAX_ANNOTATION_CLASS,
	NEUTRAL_LABEL,
	type AnnotationsLUT,
	type Label,
} from "~entity/Annotation";
import { ModelType } from "~entity/ModelInformation";
import { utf8EncodeIntegerInPlace } from "~util/encoding/Encoding";
import { countIntegerDigits } from "~util/Math";
import { assertUnreachable } from "~util/TypeScript";
import type { Serializer, SerializerData, Writer } from "../../Serializer";

/**
 * The magic comment line identifying the file format.
 * Must be the first line of the file.
 * Defined in `Specification.md`.
 */
export const MAGIC_COMMENT = "# ANNO3D-UTF-8";

/**
 * The file format version.
 * Defined in `Specification.md`.
 */
export const VERSION = "2.0";

export type HeaderKey =
	| "version"
	| "model_type"
	| "total_elements"
	| "texture_width"
	| "texture_height";

/**
 * The separator line between the header and data sections.
 * Defined in `Specification.md`.
 */
export const DATA_SEPARATOR = "data_start";

/**
 * The newline character to use for all line breaks (ASCII 0x0A).
 */
const NEW_LINE = "\n";
const NEW_LINE_UTF8 = 0x0a;

const INDICES_BUFFER_SIZE = 4096;
// 10 = max uint32 digits, 1 = sign, 1 = newline
const FLUSH_THRESHOLD = INDICES_BUFFER_SIZE - (10 + 1 + 1);

/**
 * Maps the `ModelType` enum to its UTF-8 string representation
 * as defined in `Specification.md`.
 *
 * Note: This is deliberately redundant to protect against possible
 * future changes of the underlying enum values.
 *
 * @param type The `ModelType` enum.
 * @returns The corresponding string ID.
 */
function getModelTypeString(type: ModelType) {
	switch (type) {
		case ModelType.POINT_CLOUD:
			return "point_cloud";
		case ModelType.MESH:
			return "mesh";
		case ModelType.TEXTURE_MESH:
			return "texture_mesh";
		default:
			assertUnreachable(type);
	}
}

export type ModelTypeString = ReturnType<typeof getModelTypeString>;

/**
 * Stores the results of the initial analysis pass over the `AnnotationsLUT`.
 */
interface AnalysisResult {
	/** `counts[classId]` = number of indices for that class. */
	counts: Uint32Array;
	/** `digitBuckets[digits]` = number of indices with that many digits. */
	digitBuckets: Uint32Array;
	/** Total number of non-neutral indices. */
	totalIndices: number;
}

/**
 * A type alias for the inverted data map.
 * `Map<classId, Uint32Array_of_indices>`
 */
type InvertedDataMap = Map<number, Uint32Array>;

/**
 * A serializer for the "anno3d" v2.0 UTF-8 text file format.
 *
 * This implementation is optimized for memory efficiency.
 * - When `serialize(data)` is called, it performs multiple passes to
 * calculate the *exact* final file size, allocates a single `ArrayBuffer`,
 * and writes into it.
 * - When `serialize(data, writer)` is called, it streams the output
 * without allocating a large intermediate buffer.
 */
export class SerializerUtf8 implements Serializer {
	private readonly _textEncoder: TextEncoder;

	/**
	 * Constructs a new `SerializerUtf8`.
	 */
	constructor() {
		this._textEncoder = new TextEncoder();
	}

	/**
	 * Serializes the annotation data into a new `ArrayBuffer`.
	 *
	 * @param data The in-memory annotation data to serialize.
	 * @returns An `ArrayBuffer` containing the complete UTF-8 file.
	 */
	public serialize(data: SerializerData): Promise<ArrayBuffer>;
	/**
	 * Serializes the annotation data using a stream-like `Writer`.
	 *
	 * @param data The in-memory annotation data to serialize.
	 * @param writer The `Writer` instance to write data to.
	 * @returns The total number of bytes written.
	 */
	public serialize(data: SerializerData, writer: Writer): Promise<number>;
	public serialize(
		data: SerializerData,
		writer?: Writer
	): Promise<number | ArrayBuffer> {
		const analysis = this._analyze(data.annotations);
		const invertedData = this._invert(data.annotations, analysis.counts);
		const headerString = this._createHeaderString(data);

		if (writer) {
			return this._serializeToWriter(
				data,
				invertedData,
				headerString,
				writer
			);
		} else {
			return Promise.resolve(
				this._serializeToBuffer(
					data,
					invertedData,
					analysis,
					headerString
				)
			);
		}
	}

	/**
	 * Analyzes the `AnnotationsLUT` to count indices per class
	 * and group indices by their digit length.
	 *
	 * @param annotations The `AnnotationsLUT`.
	 * @returns An `AnalysisResult` object.
	 */
	private _analyze(annotations: AnnotationsLUT): AnalysisResult {
		const counts = new Uint32Array(MAX_ANNOTATION_CLASS + 1);
		const neutralClass = NEUTRAL_LABEL.annotationClass;

		// Determine max digits needed for buckets
		const maxIndex = annotations.length - 1;
		const maxDigits = maxIndex > 0 ? countIntegerDigits(maxIndex) : 1;
		const digitBuckets = new Uint32Array(maxDigits + 1); // +1 for index = count

		let totalIndices = 0;

		for (let i = 0; i < annotations.length; i++) {
			const annotationClass = annotations[i];
			if (annotationClass === neutralClass) {
				continue;
			}

			counts[annotationClass]++;
			digitBuckets[countIntegerDigits(i)]++;
			totalIndices++;
		}

		return { counts, digitBuckets, totalIndices };
	}

	/**
	 * Inverts the `AnnotationsLUT` into a `Map` of `classId ->
	 * Uint32Array_of_indices`.
	 *
	 * @param annotations The `AnnotationsLUT`.
	 * @param counts A pre-calculated `Uint32Array` of counts per class.
	 * @returns The inverted data map.
	 */
	private _invert(
		annotations: AnnotationsLUT,
		counts: Uint32Array
	): InvertedDataMap {
		const map: InvertedDataMap = new Map();
		const writePositions = new Uint32Array(MAX_ANNOTATION_CLASS + 1);
		const neutralClass = NEUTRAL_LABEL.annotationClass;

		for (
			let annotationClass = 0;
			annotationClass < MAX_ANNOTATION_CLASS + 1;
			annotationClass++
		) {
			const count = counts[annotationClass];
			if (count > 0) {
				map.set(annotationClass, new Uint32Array(count));
			}
		}

		for (let i = 0; i < annotations.length; i++) {
			const annotationClass = annotations[i];
			if (annotationClass === neutralClass) {
				continue;
			}

			const position = writePositions[annotationClass];
			map.get(annotationClass)![position] = i;
			writePositions[annotationClass]++;
		}

		return map;
	}

	/**
	 * Creates the complete header section as a string.
	 *
	 * @param data The data to serialize.
	 * @returns A string representing the file header.
	 */
	private _createHeaderString(data: SerializerData): string {
		const lines: string[] = [];

		lines.push(MAGIC_COMMENT);
		this._appendHeaderLine(lines, "version", VERSION);
		this._appendHeaderLine(
			lines,
			"model_type",
			getModelTypeString(data.modelType)
		);

		switch (data.modelType) {
			case ModelType.TEXTURE_MESH:
				this._appendHeaderLine(lines, "texture_width", data.width);
				this._appendHeaderLine(lines, "texture_height", data.height);
				break;
			case ModelType.MESH:
			case ModelType.POINT_CLOUD:
				this._appendHeaderLine(
					lines,
					"total_elements",
					data.annotations.byteLength
				);
				break;
			default:
				assertUnreachable(data);
		}

		lines.push(NEW_LINE + DATA_SEPARATOR + NEW_LINE);

		return lines.join(NEW_LINE);
	}

	private _appendHeaderLine(
		lines: string[],
		key: HeaderKey,
		value: string | number
	) {
		return lines.push(`${key}: ${value}`);
	}

	/**
	 * Calculates the exact byte size of all `label` directive lines.
	 *
	 * @param labels The ordered list of labels.
	 * @param counts The counts per class ID.
	 * @returns The total number of bytes for all directive lines.
	 */
	private _calculateDirectivesSize(
		labels: Label[],
		counts: Uint32Array
	): number {
		let totalSize = 0;
		for (const label of labels) {
			const annotationClass = label.annotationClass;
			const count = counts[annotationClass];
			const directive = this._getLabelDirective(annotationClass, count);
			totalSize += directive.length; // only ascii characters
		}
		return totalSize;
	}

	/**
	 * Calculates the exact byte size of all index lines.
	 *
	 * @param digitBuckets The pre-calculated digit buckets.
	 * @param totalIndices The total number of indices.
	 * @returns The total number of bytes for all index lines.
	 */
	private _calculateIndicesSize(
		digitBuckets: Uint32Array,
		totalIndices: number
	): number {
		let totalDigits = 0;
		for (let digits = 1; digits < digitBuckets.length; digits++) {
			totalDigits += digits * digitBuckets[digits];
		}
		// total bytes = (all digits) + (one newline per index)
		return totalDigits + totalIndices;
	}

	/**
	 * Serializes data by streaming to a `Writer`.
	 *
	 * @returns The total number of bytes written.
	 */
	private async _serializeToWriter(
		data: SerializerData,
		invertedData: InvertedDataMap,
		headerString: string,
		writer: Writer
	): Promise<number> {
		let offset = 0;
		offset += await writer.write(this._textEncoder.encode(headerString));

		let bufferOffset = 0;
		const indicesBuffer = new Uint8Array(INDICES_BUFFER_SIZE);

		for (const label of data.labels) {
			const annotationClass = label.annotationClass;
			const indices = invertedData.get(annotationClass);

			const count = indices?.length ?? 0;
			const directive = this._getLabelDirective(annotationClass, count);
			offset += await writer.write(this._textEncoder.encode(directive));

			if (!indices) {
				continue;
			}

			for (let i = 0; i < indices.length; i++) {
				bufferOffset += utf8EncodeIntegerInPlace(
					indices[i],
					indicesBuffer,
					bufferOffset
				);
				indicesBuffer[bufferOffset++] = NEW_LINE_UTF8;

				if (bufferOffset >= FLUSH_THRESHOLD) {
					offset += await writer.write(
						indicesBuffer.subarray(0, bufferOffset)
					);
					bufferOffset = 0;
				}
			}

			if (bufferOffset > 0) {
				offset += await writer.write(
					indicesBuffer.subarray(0, bufferOffset)
				);
			}
		}
		return offset;
	}

	/**
	 * Serializes data to a single, exactly-sized `ArrayBuffer`.
	 *
	 * @returns The `ArrayBuffer` containing the file.
	 */
	private _serializeToBuffer(
		data: SerializerData,
		invertedData: InvertedDataMap,
		analysis: AnalysisResult,
		headerString: string
	): ArrayBuffer {
		const header = this._textEncoder.encode(headerString);

		const headerSize = header.byteLength;
		const directivesSize = this._calculateDirectivesSize(
			data.labels,
			analysis.counts
		);
		const indicesSize = this._calculateIndicesSize(
			analysis.digitBuckets,
			analysis.totalIndices
		);
		const totalSize = headerSize + directivesSize + indicesSize;

		const buffer = new ArrayBuffer(totalSize);
		const u8view = new Uint8Array(buffer);
		let offset = 0;

		u8view.set(header);
		offset += header.byteLength;

		for (const label of data.labels) {
			const annotationClass = label.annotationClass;
			const indices = invertedData.get(annotationClass);

			const count = indices?.length ?? 0;
			const directive = this._getLabelDirective(annotationClass, count);
			offset += this._encodeString(directive, u8view, offset);

			if (!indices) {
				continue;
			}

			for (let i = 0; i < indices.length; i++) {
				offset += utf8EncodeIntegerInPlace(indices[i], u8view, offset);
				u8view[offset++] = NEW_LINE_UTF8;
			}
		}

		return buffer;
	}

	/**
	 * Encodes a string as UTF-8 and writes it into a `Uint8Array` at a
	 * specific offset.
	 *
	 * This is a simple wrapper around the `textEncoder.encodeInto()` method
	 * to simplify writing string data to the buffer.
	 *
	 * @param s The string to encode.
	 * @param target The destination buffer to write into.
	 * @param offset The byte offset in the `target` buffer to start writing.
	 * @returns The number of bytes written.
	 */
	private _encodeString(
		s: string,
		target: Uint8Array,
		offset: number
	): number {
		return this._textEncoder.encodeInto(s, target.subarray(offset)).written;
	}

	/**
	 * Formats and returns the complete "label directive" string for a class.
	 *
	 * This includes a leading newline to separate it from the previous block,
	 * and a trailing newline to separate it from its list of indices.
	 *
	 * @example
	 * // Returns: "\nlabel 5 120\n"
	 * _getLabelDirective(5, 120);
	 *
	 * @param annotationClass The annotation class.
	 * @param count The number of indices for this class.
	 * @returns The formatted directive string.
	 */
	private _getLabelDirective(annotationClass: number, count: number): string {
		return `${NEW_LINE}label ${annotationClass} ${count}${NEW_LINE}`;
	}
}
