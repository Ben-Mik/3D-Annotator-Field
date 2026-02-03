import { type TypedArray } from "three";
import {
	array,
	arrayBufferView,
	struct,
	transfer,
	type Infer,
	type InferWire,
} from "~workers/combinators/Combinators";

/**
 * The raw data structure for just the BVH binary data.
 */
const serializedBvhSchema = struct({
	// This ensures BinaryCodec sees a TypedArray and writes the blob.
	roots: array(transfer<ArrayBuffer>()),
	index: arrayBufferView<TypedArray>(),
});

export type SerializedBvhDto = InferWire<typeof serializedBvhSchema>;
export type SerializedBvhStruct = Infer<typeof serializedBvhSchema>;

/**
 * Codec for raw BVH data.
 * Used by BufferGeometry to transfer the boundsTree data.
 */
export const SERIALIZED_BVH_WORKER_CODEC = serializedBvhSchema;
