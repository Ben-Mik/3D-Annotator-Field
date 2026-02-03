import {
	areUint8ArraysEqual,
	getArrayBufferViewConstructor,
	type ArrayBufferViewName,
} from "~util/TypedArrays";
import { assertUnreachable } from "~util/TypeScript";
import type { Codec } from "../../../core/Codec";
import type { Reader } from "../../../core/Reader";
import type { Writer } from "../../../core/Writer";
import { isHint } from "./Hints";
import type { Spec } from "./Spec";

const LITTLE_ENDIAN = true;
const ALIGNMENT = 8;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

const MAGIC_HEADER = TEXT_ENCODER.encode("ANNO_C_BC_START!");
const MAGIC_FOOTER = TEXT_ENCODER.encode("ANNO_C_BC___EOF!");

/** MAGIC_HEADER + 4 bytes (json bytes length) */
const HEADER_SIZE = MAGIC_HEADER.length + 4;

/**
 * The minimum length of a serialized file.
 * Header length + Magic Footer length
 */
const MIN_LENGTH = HEADER_SIZE + MAGIC_FOOTER.length;

const CODEC_VERSION = 1;

/**
 * Base interface for internal JSON references used by the codec.
 */
interface Ref {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	__binary_codec_type: string;
}

/**
 * Internal reference to a binary blob stored in the file.
 * Replaces the actual data in the JSON structure.
 */
interface BinaryRef extends Ref {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	__binary_codec_type: "binary";
	/** The index of this blob in the binary sequence (0-based). */
	index: number;
	/** The size of the blob in bytes. */
	byteLength: number;
	/** Metadata describing how to reconstruct the object. */
	type:
		| {
				name: "View";
				constructorName: ArrayBufferViewName;
		  }
		| { name: "ArrayBuffer" }
		| { name: "SharedArrayBuffer" }
		| { name: "Blob"; mime?: string }
		| { name: "File"; fileName: string; mime?: string };
}

type BinaryData = ArrayBufferView | ArrayBuffer | SharedArrayBuffer | Blob;

/**
 * Internal reference to a special number (NaN, Infinity) that JSON cannot handle.
 */
interface SpecialNumberRef extends Ref {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	__binary_codec_type: "special_number";
	type: "NaN" | "Infinity" | "-Infinity";
}

function isRef(value: unknown): value is Ref {
	return (
		value !== null &&
		typeof value === "object" &&
		"__binary_codec_type" in value
	);
}

function isBinaryRef(value: unknown): value is BinaryRef {
	const flag: BinaryRef["__binary_codec_type"] = "binary";
	return isRef(value) && value.__binary_codec_type === flag;
}

function isSpecialNumberRef(value: unknown): value is SpecialNumberRef {
	const flag: SpecialNumberRef["__binary_codec_type"] = "special_number";
	return isRef(value) && value.__binary_codec_type === flag;
}

/**
 * The top-level JSON structure stored in the file.
 */
interface Envelope {
	codecVersion: number;
	specId: string;
	specVersion: number;
	data: unknown;
}

/**
 * A robust, versioned codec for objects containing binary data.
 *
 * This class handles the low-level details of persisting complex objects to the cache:
 * - Separates structural data (JSON) from binary data (Buffers/Views/Blobs) for performance.
 * - Wraps files in Magic Header/Footers to detect corruption.
 * - Enforces 8-byte alignment for binary blobs.
 * - Supports "Smart Resolution": Can store data as a Buffer but read it back as a File, and vice-versa.
 */
export class BinaryCodec<Output, DTO, Input = Output>
	implements Codec<Output, Input>
{
	public readonly spec: Spec<Output, DTO, Input>;

	private readonly _logPrefix: string;

	constructor(spec: Spec<Output, DTO, Input>) {
		this.spec = spec;
		this._logPrefix = `[BinaryCodec ${spec.id} v${spec.version}]`;
	}

	/** @inheritdoc */
	public async encode(instance: Input, writer: Writer): Promise<boolean> {
		const binaryDataCollector: BinaryData[] = [];

		const dto = this.spec.dehydrate(instance);

		const envelope: Envelope = {
			codecVersion: CODEC_VERSION,
			specId: this.spec.id,
			specVersion: this.spec.version,
			data: dto,
		} satisfies Envelope;

		let jsonString: string;

		try {
			jsonString = JSON.stringify(envelope, (_, value) => {
				let result = value as unknown;

				result = this._detectSpecialNumber(result);
				result = this._detectBinaryData(result, binaryDataCollector);
				result = this._detectHint(result, binaryDataCollector);

				return result;
			});
		} catch (error) {
			console.warn(`${this._logPrefix} Serialization failed:`, error);
			return false;
		}

		let bytesWritten = 0;

		if (!(await writer.write(MAGIC_HEADER))) return false;
		bytesWritten += MAGIC_HEADER.byteLength;

		const jsonBytes = TEXT_ENCODER.encode(jsonString);
		const sizeBuffer = new ArrayBuffer(4);
		const sizeView = new DataView(sizeBuffer);
		sizeView.setUint32(0, jsonBytes.byteLength, LITTLE_ENDIAN);

		if (!(await writer.write([sizeBuffer, jsonBytes]))) return false;
		bytesWritten += sizeBuffer.byteLength + jsonBytes.byteLength;

		for (const data of binaryDataCollector) {
			const paddingNeeded = this._getPadding(bytesWritten);

			if (paddingNeeded > 0) {
				const padding = new Uint8Array(paddingNeeded);
				if (!(await writer.write(padding))) return false;
				bytesWritten += paddingNeeded;
			}

			if (data instanceof Blob) {
				// todo: Optimization - In the future, writer.write() should accept Blob to stream directly
				const buffer = await data.arrayBuffer();
				if (!(await writer.write(buffer))) return false;
				bytesWritten += buffer.byteLength;
			} else {
				if (!(await writer.write(data))) return false;
				bytesWritten += data.byteLength;
			}
		}

		if (!(await writer.write(MAGIC_FOOTER))) return false;

		return true;
	}

	/** @inheritdoc */
	public async decode(reader: Reader): Promise<Output | null> {
		const length = reader.byteLength;
		if (length < MIN_LENGTH) {
			console.warn(
				`${this._logPrefix} File too small (length: ${length}). Expected at least ${MIN_LENGTH} bytes.`
			);
			return null;
		}

		let headerBuffer: ArrayBuffer;
		try {
			headerBuffer = await reader.read(0, HEADER_SIZE);
		} catch (error) {
			console.warn(`${this._logPrefix} Failed to read header:`, error);
			return null;
		}

		const headerView = new Uint8Array(headerBuffer);
		const magic = headerView.subarray(0, MAGIC_HEADER.length);

		if (!areUint8ArraysEqual(magic, MAGIC_HEADER)) {
			console.warn(`${this._logPrefix} Invalid magic header.`);
			return null;
		}

		const sizeView = new DataView(headerBuffer);
		const jsonLength = sizeView.getUint32(
			MAGIC_HEADER.length,
			LITTLE_ENDIAN
		);

		const jsonStart = HEADER_SIZE;
		let jsonBuffer: ArrayBuffer;
		try {
			jsonBuffer = await reader.read(jsonStart, jsonLength);
		} catch (error) {
			console.warn(
				`${this._logPrefix} Failed to read JSON payload:`,
				error
			);
			return null;
		}

		if (jsonBuffer.byteLength !== jsonLength) {
			console.warn(
				`${this._logPrefix} JSON payload truncated. Expected ${jsonLength}, got ${jsonBuffer.byteLength}.`
			);
			return null;
		}

		let envelope: Envelope;

		try {
			const jsonString = TEXT_DECODER.decode(jsonBuffer);
			envelope = JSON.parse(jsonString, (_, value) =>
				this._reviveSpecialNumber(value)
			) as Envelope;
		} catch (error) {
			console.warn(`${this._logPrefix} JSON parse failed:`, error);
			return null;
		}

		if (envelope.codecVersion !== CODEC_VERSION) {
			console.warn(
				`${this._logPrefix} Unsupported internal codec version. Expected ${CODEC_VERSION}, got ${envelope.codecVersion}.`
			);
			return null;
		}

		if (envelope.specId !== this.spec.id) {
			console.warn(
				`${this._logPrefix} Spec ID mismatch. Expected '${this.spec.id}', got '${envelope.specId}'.`
			);
			return null;
		}

		if (envelope.specVersion !== this.spec.version) {
			console.warn(
				`${this._logPrefix} Spec version mismatch. Expected ${this.spec.version}, got ${envelope.specVersion}.`
			);
			return null;
		}

		const dto = envelope.data;

		const blobMap = new Map<number, BinaryRef>();
		this._walkObject(dto, (ref) => {
			blobMap.set(ref.index, ref);
		});

		const maxIndex = blobMap.size > 0 ? Math.max(...blobMap.keys()) : -1;

		const blobOffsets = new Map<number, number>();

		let currentOffset = jsonStart + jsonLength;

		for (let i = 0; i <= maxIndex; i++) {
			const blob = blobMap.get(i);
			if (!blob) {
				/*
				 * The BinaryCodec writes blobs sequentially (0, 1, 2...).
				 * To calculate the offset of blob N, we need the size of blob N-1.
				 * If an index is missing, it implies the file logic is corrupt or
				 * the metadata is desynchronized. We cannot proceed safely.
				 */
				console.warn(
					`${this._logPrefix} Corrupt file structure: Missing blob index ${i}. Blobs must be sequential.`
				);
				return null;
			}

			const padding = this._getPadding(currentOffset);
			const start = currentOffset + padding;
			blobOffsets.set(i, start);

			currentOffset = start + blob.byteLength;
		}

		const fetchJobs: Promise<unknown>[] = [];
		const ioErrors: unknown[] = [];

		this._walkObject(dto, (ref, key, parent) => {
			const start = blobOffsets.get(ref.index);
			if (start === undefined) {
				/*
				 * This branch should be unreachable because we validated continuity above.
				 */
				throw new Error(
					`${this._logPrefix} Critical Logic Error: Blob offset missing for index ${ref.index}.`
				);
			}

			const length = ref.byteLength;
			const type = ref.type;

			let job: Promise<unknown>;

			const safeRead = (promise: Promise<unknown>) => {
				return promise.catch((err) => {
					ioErrors.push(err);
				});
			};

			switch (type.name) {
				case "File": {
					try {
						const blob = reader.slice(start, length, type.mime);
						parent[key] = new File([blob], type.fileName, {
							type: type.mime,
						});
						job = Promise.resolve();
					} catch (e) {
						ioErrors.push(e);
						job = Promise.resolve();
					}
					break;
				}
				case "Blob": {
					try {
						parent[key] = reader.slice(start, length, type.mime);
						job = Promise.resolve();
					} catch (e) {
						ioErrors.push(e);
						job = Promise.resolve();
					}
					break;
				}
				case "ArrayBuffer": {
					job = safeRead(
						reader.read(start, length).then((buffer) => {
							parent[key] = buffer;
						})
					);
					break;
				}
				case "SharedArrayBuffer": {
					const sharedBuffer = new SharedArrayBuffer(length);
					job = safeRead(reader.readInto(sharedBuffer, start));
					break;
				}
				case "View": {
					job = safeRead(
						reader.read(start, length).then((buffer) => {
							const constructor = getArrayBufferViewConstructor(
								type.constructorName
							);
							if (constructor) {
								parent[key] = new constructor(buffer);
							}
						})
					);
					break;
				}
				default: {
					assertUnreachable(type);
				}
			}

			fetchJobs.push(job);
		});

		await Promise.all(fetchJobs);

		if (ioErrors.length > 0) {
			console.warn(
				`${this._logPrefix} Failed to read one or more binary blobs:`,
				ioErrors[0]
			);
			return null;
		}

		return this.spec.hydrate(dto as DTO);
	}

	private _detectSpecialNumber(value: unknown): unknown {
		if (typeof value === "number") {
			if (Number.isNaN(value)) {
				return {
					__binary_codec_type: "special_number",
					type: "NaN",
				} satisfies SpecialNumberRef;
			}
			if (value === Infinity) {
				return {
					__binary_codec_type: "special_number",
					type: "Infinity",
				} satisfies SpecialNumberRef;
			}
			if (value === -Infinity) {
				return {
					__binary_codec_type: "special_number",
					type: "-Infinity",
				} satisfies SpecialNumberRef;
			}
		}
		return value;
	}

	private _reviveSpecialNumber(value: unknown) {
		if (isSpecialNumberRef(value)) {
			if (value.type === "NaN") {
				return NaN;
			} else if (value.type === "Infinity") {
				return Infinity;
			} else if (value.type === "-Infinity") {
				return -Infinity;
			} else {
				assertUnreachable(value.type);
			}
		}
		return value;
	}

	private _detectBinaryData(
		value: unknown,
		collector: BinaryData[]
	): unknown {
		const result = this._extractBinaryMetadata(value);

		if (result) {
			collector.push(result.data);
			return {
				__binary_codec_type: "binary",
				index: collector.length - 1,
				byteLength: result.size,
				type: result.type,
			} satisfies BinaryRef;
		}

		return value;
	}

	private _extractBinaryMetadata(value: unknown) {
		let result: {
			type: BinaryRef["type"];
			data: BinaryData;
			size: number;
		} | null = null;

		if (ArrayBuffer.isView(value)) {
			result = {
				data: value,
				size: value.byteLength,
				type: {
					name: "View",
					constructorName: value.constructor
						.name as ArrayBufferViewName,
				},
			};
		} else if (value instanceof SharedArrayBuffer) {
			result = {
				data: value,
				size: value.byteLength,
				type: {
					name: "SharedArrayBuffer",
				},
			};
		} else if (value instanceof ArrayBuffer) {
			result = {
				data: value,
				size: value.byteLength,
				type: {
					name: "ArrayBuffer",
				},
			};
		} else if (value instanceof Blob) {
			const dataAndSize = {
				data: value,
				size: value.size,
			};

			if (value instanceof File) {
				result = {
					...dataAndSize,
					type: {
						name: "File",
						fileName: value.name,
						mime: value.type,
					},
				};
			} else {
				result = {
					...dataAndSize,
					type: {
						name: "Blob",
						mime: value.type,
					},
				};
			}
		}

		return result;
	}

	private _detectHint(value: unknown, collector: BinaryData[]): unknown {
		if (!isHint(value)) {
			return value;
		}

		const hint = value;

		const inputValue = this._extractBinaryMetadata(hint.value);
		if (!inputValue) {
			/*
			 * This indicates a developer error that should have been catched by
			 * typescript: applying a binary hint to non-binary data. We throw
			 * immediately to prevent writing a corrupted or nonsensical file.
			 */
			throw new Error(
				`${this._logPrefix} Invalid usage: Hint '${
					hint.type
				}' was applied to a value of type '${typeof hint.value}'. Hints can only be applied to binary data types.`
			);
		}

		const { data, size } = inputValue;

		let type: BinaryRef["type"];

		switch (hint.type) {
			case "ArrayBuffer":
				type = { name: "ArrayBuffer" };
				break;
			case "SharedArrayBuffer":
				type = { name: "SharedArrayBuffer" };
				break;
			case "File":
				type = {
					name: "File",
					fileName: hint.name,
					mime: hint.mimeType,
				};
				break;
			case "Blob":
				type = {
					name: "Blob",
					mime: hint.mimeType,
				};
				break;
			default:
				assertUnreachable(hint);
		}

		collector.push(data);

		return {
			__binary_codec_type: "binary",
			index: collector.length - 1,
			byteLength: size,
			type,
		} satisfies BinaryRef;
	}

	private _getPadding(bytes: number) {
		return (ALIGNMENT - (bytes % ALIGNMENT)) % ALIGNMENT;
	}

	private _walkObject(
		obj: unknown,
		callback: (
			ref: BinaryRef,
			key: string | number,
			parent: Record<string | number, unknown>
		) => void
	): void {
		if (obj === null || typeof obj !== "object") {
			return;
		}

		const record = obj as Record<string | number, unknown>;
		for (const key of Object.keys(record)) {
			const value = record[key];

			if (isBinaryRef(value)) {
				callback(value, key, record);
				continue;
			}

			if (value !== null && typeof value === "object") {
				this._walkObject(value, callback);
			}
		}
	}
}
