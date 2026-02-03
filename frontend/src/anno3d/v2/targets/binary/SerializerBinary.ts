import { NEUTRAL_LABEL, type Label } from "~entity/Annotation";
import { ModelType } from "~entity/ModelInformation";
import { toUint8Array } from "~util/TypedArrays";
import { assertUnreachable } from "~util/TypeScript";
import type { Serializer, SerializerData, Writer } from "../../Serializer";

/**
 * The 8-byte magic signature at the beginning of every anno3d binary file.
 * Defined in `Specification.md`.
 */
export const MAGIC_FILE_SIGNATURE = "ANNO3D_B";

/**
 * The fixed size (16 bytes) of the file's top-level header.
 * Defined in `Specification.md`.
 */
export const FILE_HEADER_SIZE = 16;

/**
 * The fixed size (16 bytes) of the header for *every* chunk.
 * (Chunk ID + Reserved + Data Length). Defined in `Specification.md`.
 */
export const CHUNK_HEADER_SIZE = 16;

/**
 * The 4-byte ID for the chunk containing file metadata.
 * Defined in `Specification.md`.
 */
export const HEAD_CHUNK_ID = "HEAD";

/**
 * The fixed payload size (16 bytes) for the metadata ("HEAD") chunk.
 * Defined in `Specification.md`.
 */
export const HEAD_CHUNK_PAYLOAD_SIZE = 16;

/**
 * The 4-byte ID for the chunk containing the main data array.
 * Defined in `Specification.md`.
 */
export const DATA_CHUNK_ID = "DATA";

/**
 * The 4-byte ID for the "Annotation Classes Chunk" (Class LiST).
 * Defined in `Specification.md`.
 */
export const CLST_CHUNK_ID = "CLST";

export type ChunkID =
	| typeof HEAD_CHUNK_ID
	| typeof DATA_CHUNK_ID
	| typeof CLST_CHUNK_ID;

/**
 * The major version of the file format (2 for v2.0).
 * Defined in `Specification.md`.
 */
export const MAJOR_VERSION = 2;

/**
 * The minor version of the file format (0 for v2.0).
 * Defined in `Specification.md`.
 */
export const MINOR_VERSION = 0;

/**
 * The endianness for all multi-byte values (true = Little-Endian).
 * Defined in `Specification.md`.
 */
export const LITTLE_ENDIAN = true;

/**
 * Maps the `ModelType` enum to its 32-bit integer ID for serialization.
 *
 * @param type The `ModelType` enum.
 * @returns The corresponding 32-bit integer ID.
 */
function getModelTypeId(type: ModelType) {
	switch (type) {
		case ModelType.POINT_CLOUD:
			return 0;
		case ModelType.MESH:
			return 1;
		case ModelType.TEXTURE_MESH:
			return 2;
		default:
			assertUnreachable(type);
	}
}

export type ModelTypeId = ReturnType<typeof getModelTypeId>;

/**
 * Options for the binary serializer.
 */
export interface SerializerBinaryOptions {
	/**
	 * The annotation class that will be written into the "HEAD" chunk's
	 * "Neutral Class" field.
	 *
	 * **WARNING:** Any parser reading the output file **must** interpret this
	 * as the "un-annotated" class. If this value does not match the class *actually*
	 * used for neutral elements in the `annotations` buffer (and `remapNeutralClass`
	 * is `false`), the file will be misinterpreted, leading to data corruption.
	 *
	 * **Default:** Annotation class of {@link NEUTRAL_LABEL}.
	 */
	neutralClass?: number;

	/**
	 * If `true`, transforms the `annotations` buffer by replacing all instances
	 * of the internal `NEUTRAL_LABEL.annotationClass` with the `neutralClass`
	 * provided in this options object.
	 *
	 * This ensures the "HEAD" chunk's "Neutral Class" field and the "DATA" chunk's
	 * payload are consistent.
	 *
	 * **WARNING:** If `false` (default), the `annotations` buffer is written as-is.
	 * If the `neutralClass` option is set to a value *different* from the one used
	 * in the `annotations` buffer, the resulting file will be corrupt from a
	 * data-interpretation perspective.
	 *
	 * **Note**: When serializing to a Writer, setting this to true will allocate a
	 * temporary in-memory copy of the entire annotations buffer to perform the remap,
	 * which may have significant memory implications for large datasets.
	 *
	 * **Default:** false
	 */
	remapNeutralClass?: boolean;
}

/**
 * A serializer for the "anno3d" v2.0 binary file format.
 *
 * This class implements the `Serializer` interface and handles the conversion
 * of in-memory `SerializerData` into a valid `anno3d` v2.0 binary file,
 * as defined in `Specification.md`.
 */
export class SerializerBinary implements Serializer {
	private readonly _textEncoder: TextEncoder;
	private readonly _neutralClass: number;
	private readonly _remapNeutralClass: boolean;

	/**
	 * Constructs a new `SerializerBinary`.
	 *
	 * @param options Optional configuration for the serializer.
	 */
	constructor(options?: SerializerBinaryOptions) {
		this._textEncoder = new TextEncoder();
		this._neutralClass =
			options?.neutralClass === undefined
				? NEUTRAL_LABEL.annotationClass
				: options.neutralClass;
		this._remapNeutralClass = options?.remapNeutralClass ?? false;
	}

	/**
	 * Serializes the annotation data into a new `ArrayBuffer`.
	 *
	 * @param data The in-memory annotation data to serialize.
	 * @returns An `ArrayBuffer` containing the complete binary file.
	 */
	public serialize(data: SerializerData): Promise<ArrayBuffer>;
	/**
	 * Serializes the annotation data using a `Writer`.
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
		this._validateNeutralLabel(data.labels);

		// pre-build the metadata part of the file
		const metadata = this._createMetadataBuffer(data);

		if (writer) {
			return this._serializeToWriter(data, metadata, writer);
		}
		return Promise.resolve(this._serializeToBuffer(data, metadata));
	}

	/**
	 * Validates that no label in the list uses the same annotation
	 * class as the designated neutral class.
	 *
	 * @param labels The list of active labels.
	 */
	private _validateNeutralLabel(labels: Label[]): void {
		for (const label of labels) {
			if (label.annotationClass !== this._neutralClass) {
				continue;
			}

			throw new Error(
				`Annotation class collision. Neutral class: ${this._neutralClass}, ` +
					`Label: ${label.name} (${label.annotationClass}) `
			);
		}
	}

	/**
	 * Creates and fills a new buffer with the file header, "HEAD" chunk,
	 * "CLST" chunk, and the chunk header for the "DATA" chunk.
	 *
	 * The resulting buffer contains everything *except* the "DATA" chunk's
	 * payload.
	 *
	 * @param data The serializer data.
	 * @returns A new `ArrayBuffer` containing all file metadata.
	 */
	private _createMetadataBuffer(data: SerializerData): ArrayBuffer {
		const annotationClasses = this._createClassList(data.labels);
		const clstChunkPayloadSize = annotationClasses.byteLength;

		const totalSize =
			FILE_HEADER_SIZE +
			(CHUNK_HEADER_SIZE + HEAD_CHUNK_PAYLOAD_SIZE) +
			(CHUNK_HEADER_SIZE + clstChunkPayloadSize) +
			CHUNK_HEADER_SIZE; // For "DATA" chunk header

		const buffer = new ArrayBuffer(totalSize);
		const dataView = new DataView(buffer);
		let offset = 0;

		offset += this._writeFileHeader(dataView, offset);
		offset += this._writeHEADChunk(dataView, offset, data);
		offset += this._writeCLSTChunk(dataView, offset, annotationClasses);

		this._writeChunkHeader(
			dataView,
			offset,
			DATA_CHUNK_ID,
			data.annotations.byteLength
		);

		return buffer;
	}

	/**
	 * Serializes the data into a new, single `ArrayBuffer`.
	 *
	 * @param data The annotation data.
	 * @param metadata The pre-built metadata buffer.
	 * @returns A new `ArrayBuffer` containing the complete file.
	 */
	private _serializeToBuffer(
		data: SerializerData,
		metadata: ArrayBuffer
	): ArrayBuffer {
		const dataChunkPayloadSize = data.annotations.byteLength;
		const totalSize = metadata.byteLength + dataChunkPayloadSize;

		const buffer = new ArrayBuffer(totalSize);
		const array = new Uint8Array(buffer);

		array.set(new Uint8Array(metadata));
		array.set(data.annotations, metadata.byteLength);

		if (this._remapNeutralClass) {
			const oldNeutral = NEUTRAL_LABEL.annotationClass;
			const newNeutral = this._neutralClass;

			if (newNeutral !== oldNeutral) {
				this._transformNeutralClass(
					array.subarray(metadata.byteLength),
					oldNeutral,
					newNeutral
				);
			}
		}

		return buffer;
	}

	/**
	 * Serializes the data sequentially using a `Writer`.
	 *
	 * @param data The annotation data.
	 * @param metadata The pre-built metadata buffer.
	 * @param writer The `Writer` to stream to.
	 * @returns The total number of bytes written.
	 */
	private async _serializeToWriter(
		data: SerializerData,
		metadata: ArrayBuffer,
		writer: Writer
	): Promise<number> {
		let totalBytesWritten = 0;

		totalBytesWritten += await writer.write(metadata);

		let annotations = data.annotations;

		const oldNeutral = NEUTRAL_LABEL.annotationClass;
		const newNeutral = this._neutralClass;
		if (this._remapNeutralClass && newNeutral !== oldNeutral) {
			const annotationsCopy = data.annotations.slice();
			this._transformNeutralClass(
				annotationsCopy,
				oldNeutral,
				newNeutral
			);
			annotations = annotationsCopy;
		}

		totalBytesWritten += await writer.write(annotations);
		return totalBytesWritten;
	}

	/**
	 * Creates a `Uint8Array` of all annotation classes from the `Label` list.
	 *
	 * @param labels A list of labels.
	 * @returns A `Uint8Array` containing the annotation class of each label.
	 */
	private _createClassList(labels: Label[]): Uint8Array {
		const annotationClasses = new Uint8Array(labels.length);
		for (let i = 0; i < labels.length; i++) {
			annotationClasses[i] = labels[i].annotationClass;
		}
		return annotationClasses;
	}

	/**
	 * Writes the 16-byte File Header into the `DataView` at the given offset.
	 *
	 * @param view The `DataView` to write into.
	 * @param offset The offset to begin writing.
	 * @returns The number of bytes written (16).
	 */
	private _writeFileHeader(view: DataView, offset: number): number {
		// 8-byte magic file signature
		const signature = this._textEncoder.encode(MAGIC_FILE_SIGNATURE);
		toUint8Array(view).set(signature, offset);

		// Version numbers
		view.setUint8(offset + 8, MAJOR_VERSION);
		view.setUint8(offset + 9, MINOR_VERSION);

		// 6-byte Reserved (implicitly 0 by ArrayBuffer initialization)
		return FILE_HEADER_SIZE;
	}

	/**
	 * Writes a 16-byte Chunk Header into the `DataView` at the given offset.
	 *
	 * @param view The `DataView` to write into.
	 * @param offset The offset to begin writing.
	 * @param id The 4-character Chunk ID.
	 * @param length The 64-bit length of the chunk's payload.
	 * @returns The number of bytes written (16).
	 */
	private _writeChunkHeader(
		view: DataView,
		offset: number,
		id: ChunkID,
		length: number
	): number {
		// 4-byte Chunk ID
		const chunkId = this._textEncoder.encode(id);
		toUint8Array(view).set(chunkId, offset);

		// 4-byte Reserved (implicitly 0)

		// 8-byte Data Length
		view.setBigUint64(offset + 8, BigInt(length), LITTLE_ENDIAN);
		return CHUNK_HEADER_SIZE;
	}

	/**
	 * Writes the complete "HEAD" chunk (Header + 16-byte Value).
	 *
	 * @param view The `DataView` to write into.
	 * @param offset The offset to begin writing.
	 * @param data The serializer data.
	 * @returns The total number of bytes written (32).
	 */
	private _writeHEADChunk(
		view: DataView,
		offset: number,
		data: SerializerData
	): number {
		this._writeChunkHeader(
			view,
			offset,
			HEAD_CHUNK_ID,
			HEAD_CHUNK_PAYLOAD_SIZE
		);

		const payloadOffset = offset + CHUNK_HEADER_SIZE;

		// Write 16-byte "HEAD" Value

		view.setUint32(
			payloadOffset + 0,
			getModelTypeId(data.modelType),
			LITTLE_ENDIAN
		);

		const width =
			data.modelType === ModelType.TEXTURE_MESH ? data.width : 0;
		const height =
			data.modelType === ModelType.TEXTURE_MESH ? data.height : 0;
		view.setUint16(payloadOffset + 4, width, LITTLE_ENDIAN);
		view.setUint16(payloadOffset + 6, height, LITTLE_ENDIAN);

		view.setUint8(payloadOffset + 8, this._neutralClass);

		// 7-byte Reserved (implicitly 0)

		return CHUNK_HEADER_SIZE + HEAD_CHUNK_PAYLOAD_SIZE;
	}

	/**
	 * Writes the complete "CLST" chunk (Header + Value).
	 *
	 * @param view The `DataView` to write into.
	 * @param offset The offset to begin writing.
	 * @param annotationClasses The `Uint8Array` payload.
	 * @returns The total number of bytes written (16 + payload size).
	 */
	private _writeCLSTChunk(
		view: DataView,
		offset: number,
		annotationClasses: Uint8Array
	): number {
		const payloadOffset = offset + CHUNK_HEADER_SIZE;
		const payloadSize = annotationClasses.byteLength;

		this._writeChunkHeader(view, offset, CLST_CHUNK_ID, payloadSize);

		toUint8Array(view).set(annotationClasses, payloadOffset);
		return CHUNK_HEADER_SIZE + payloadSize;
	}
	/**
	 * Replaces all occurrences of the old neutral class with the new one,
	 * _in-place_ on the provided array.
	 *
	 * @param annotations The `Uint8Array` to mutate.
	 * @param oldNeutral The annotation class to find.
	 * @param newNeutral The annotation class to replace with.
	 */
	private _transformNeutralClass(
		annotations: Uint8Array,
		oldNeutral: number,
		newNeutral: number
	): void {
		for (let i = 0; i < annotations.length; i++) {
			if (annotations[i] === oldNeutral) {
				annotations[i] = newNeutral;
			}
		}
	}
}
