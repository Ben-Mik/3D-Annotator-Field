export type HintValue =
	| File
	| Blob
	| ArrayBufferView
	| ArrayBuffer
	| SharedArrayBuffer;

export type HintOutput = ArrayBuffer | SharedArrayBuffer | Blob | File;

/**
 * Base interface for all hints.
 */
export interface HintBase<
	Value extends HintValue = HintValue,
	Result extends HintOutput = HintOutput
> {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	__binary_codec_hint: true;
	type: string;
	value: Value;
	/** Phantom property (never used at runtime) to carry the Result type information. */
	_phantom?: Result;
}

/**
 * A hint indicating the target should be restored as a Buffer.
 */
export interface BinaryHint<
	Value extends HintValue = HintValue,
	Result extends HintOutput = HintOutput
> extends HintBase<Value, Result> {
	type: "ArrayBuffer" | "SharedArrayBuffer";
}

/**
 * A hint indicating the target should be restored as a `Blob`.
 */
export interface BlobHint<Value extends HintValue = HintValue>
	extends HintBase<Value, Blob> {
	type: "Blob";
	mimeType?: string;
}

/**
 * A hint indicating the target should be restored as a `File`.
 */
export interface FileHint<Value extends HintValue = HintValue>
	extends HintBase<Value, File> {
	type: "File";
	name: string;
	mimeType?: string;
}

/**
 * Internal object used to guide the binary serialization and deserialization process.
 * Holds the value to be serialized and information about how it should be deserialized.
 */
export type Hint = BinaryHint | BlobHint | FileHint;

/**
 * Checks if a value is a Binary Codec Hint.
 */
export function isHint(value: unknown): value is Hint {
	return (
		value !== null &&
		typeof value === "object" &&
		"__binary_codec_hint" in value &&
		value.__binary_codec_hint === true
	);
}

/**
 * Wraps a value to indicate it should be restored as an `ArrayBuffer`.
 */
export function asArrayBuffer<T extends HintValue>(
	value: T
): BinaryHint<T, ArrayBuffer> {
	return { __binary_codec_hint: true, type: "ArrayBuffer", value: value };
}

/**
 * Wraps a value to indicate it should be restored as a `SharedArrayBuffer`.
 */
export function asSharedArrayBuffer<T extends HintValue>(
	value: T
): BinaryHint<T, SharedArrayBuffer> {
	return {
		__binary_codec_hint: true,
		type: "SharedArrayBuffer",
		value: value,
	};
}

/**
 * Wraps a value to indicate it should be restored as a `Blob` (Zero-Copy).
 *
 * @param value - The binary data source.
 * @param mimeType - Optional MIME type for the resulting Blob.
 */
export function asBlob<T extends HintValue>(
	value: T,
	mimeType?: string
): BlobHint<T> {
	return { __binary_codec_hint: true, type: "Blob", value, mimeType };
}

/**
 * Wraps a value to indicate it should be restored as a `File` (Zero-Copy).
 *
 * @param value - The binary data source.
 * @param name - The filename to use upon restoration.
 * @param mimeType - Optional MIME type.
 */
export function asFile<T extends HintValue>(
	value: T,
	name: string,
	mimeType?: string
): FileHint<T> {
	return { __binary_codec_hint: true, type: "File", value, name, mimeType };
}
