import {
	BufferAttribute,
	InterleavedBuffer,
	InterleavedBufferAttribute,
	type AttributeGPUType,
	type TypedArray,
	type Usage,
} from "three";
import { defineBinaryCacheCodec } from "~cache/index";
import {
	arrayBufferView,
	boolean,
	map,
	number,
	optional,
	struct,
	type Infer,
	type InferWire,
} from "~workers/combinators/Combinators";
import type { WorkerCodec } from "~workers/index";

const bufferAttributeSchema = struct({
	array: arrayBufferView<TypedArray>(),
	itemSize: number,
	normalized: boolean,
	isInterleaved: boolean,
	stride: optional(number),
	offset: optional(number),
	usage: optional(number),
	gpuType: optional(number),
});

export type BufferAttributeDTO = InferWire<typeof bufferAttributeSchema>;
type BufferAttributeStruct = Infer<typeof bufferAttributeSchema>;

type AnyAttribute = BufferAttribute | InterleavedBufferAttribute;

function toStruct(attribute: AnyAttribute): BufferAttributeStruct {
	const isInterleaved = attribute instanceof InterleavedBufferAttribute;

	const base = {
		array: attribute.array,
		itemSize: attribute.itemSize,
		normalized: attribute.normalized,
		isInterleaved,
	};

	if (isInterleaved) {
		return {
			...base,
			stride: attribute.data.stride,
			offset: attribute.offset,
			usage: undefined,
			gpuType: undefined,
		};
	}

	const std = attribute;
	return {
		...base,
		usage: std.usage,
		gpuType: std.gpuType,
	};
}

function fromStruct(struct: BufferAttributeStruct): AnyAttribute {
	if (struct.isInterleaved) {
		const buffer = new InterleavedBuffer(
			struct.array,
			struct.stride ?? struct.itemSize
		);

		return new InterleavedBufferAttribute(
			buffer,
			struct.itemSize,
			struct.offset ?? 0,
			struct.normalized
		);
	}

	const attr = new BufferAttribute(
		struct.array,
		struct.itemSize,
		struct.normalized
	);

	if (struct.usage !== undefined) {
		attr.setUsage(struct.usage as Usage);
	}

	if (struct.gpuType !== undefined) {
		attr.gpuType = struct.gpuType as AttributeGPUType;
	}

	return attr;
}

/**
 * Handles both `BufferAttribute` and `InterleavedBufferAttribute`.
 */
export const ANY_BUFFER_ATTRIBUTE_WORKER_CODEC: WorkerCodec<
	AnyAttribute,
	BufferAttributeDTO
> = map(bufferAttributeSchema, fromStruct, toStruct);

/**
 * Strict codec that ONLY accepts and returns `BufferAttribute`.
 *
 * @throws if hydration produces an InterleavedBufferAttribute.
 */
export const BUFFER_ATTRIBUTE_WORKER_CODEC: WorkerCodec<
	BufferAttribute,
	BufferAttributeDTO
> = {
	pack(input) {
		return ANY_BUFFER_ATTRIBUTE_WORKER_CODEC.pack(input);
	},
	unpack(wire) {
		const result = ANY_BUFFER_ATTRIBUTE_WORKER_CODEC.unpack(wire);
		if (result instanceof InterleavedBufferAttribute) {
			throw new Error(
				"Strict BufferAttribute codec received InterleavedBufferAttribute."
			);
		}
		return result;
	},
};

export const BUFFER_ATTRIBUTE_CACHE_CODEC = defineBinaryCacheCodec({
	id: "THREE.BufferAttribute",
	version: 1,
	dehydrate: toStruct,
	hydrate: fromStruct,
});
