import {
	BufferAttribute,
	BufferGeometry,
	InterleavedBufferAttribute,
	type TypedArray,
} from "three";
import { MeshBVH } from "three-mesh-bvh";
import { defineBinaryCacheCodec } from "~cache/index";
import {
	array,
	identity,
	map,
	nullable,
	number,
	optional,
	record,
	string,
	struct,
	type Infer,
	type InferWire,
} from "~workers/combinators/Combinators";
import type { WorkerCodec } from "~workers/index";
import {
	ANY_BUFFER_ATTRIBUTE_WORKER_CODEC,
	BUFFER_ATTRIBUTE_WORKER_CODEC,
} from "./BufferAttribute";
import { SERIALIZED_BVH_WORKER_CODEC } from "./MeshBvh";
import { BOX_3_WORKER_CODEC, SPHERE_WORKER_CODEC } from "./Primitives";

const geometryGroupSchema = struct({
	start: number,
	count: number,
	materialIndex: optional(number),
});

const drawRangeSchema = struct({
	start: number,
	count: number,
});

const bufferGeometrySchema = struct({
	name: string,
	index: nullable(BUFFER_ATTRIBUTE_WORKER_CODEC),
	attributes: record(ANY_BUFFER_ATTRIBUTE_WORKER_CODEC),
	groups: array(geometryGroupSchema),
	drawRange: drawRangeSchema,
	userData: identity<Record<string, unknown>>(),
	boundingBox: nullable(BOX_3_WORKER_CODEC),
	boundingSphere: nullable(SPHERE_WORKER_CODEC),
	boundsTree: optional(SERIALIZED_BVH_WORKER_CODEC),
});

export type BufferGeometryDTO = InferWire<typeof bufferGeometrySchema>;
type BufferGeometryStruct = Infer<typeof bufferGeometrySchema>;

function toStruct(geometry: BufferGeometry): BufferGeometryStruct {
	const attributes: Record<
		string,
		BufferAttribute | InterleavedBufferAttribute
	> = {};

	for (const key in geometry.attributes) {
		const attr = geometry.attributes[key];
		if (
			attr instanceof BufferAttribute ||
			attr instanceof InterleavedBufferAttribute
		) {
			attributes[key] = attr;
		} else {
			console.warn(
				`[BufferGeometryCodec] Stripping attribute "${key}": Expected BufferAttribute or InterleavedBufferAttribute, found:`,
				attr
			);
		}
	}

	let boundsTreeData;
	if (geometry.boundsTree) {
		const serialized = MeshBVH.serialize(geometry.boundsTree);
		boundsTreeData = {
			roots: serialized.roots,
			index: serialized.index as TypedArray,
		};
	}

	return {
		name: geometry.name,
		index: geometry.index,
		attributes,
		groups: geometry.groups,
		drawRange: {
			start: geometry.drawRange.start,
			count: geometry.drawRange.count,
		},
		userData: geometry.userData,
		boundingBox: geometry.boundingBox,
		boundingSphere: geometry.boundingSphere,
		boundsTree: boundsTreeData,
	};
}

function fromStruct(struct: BufferGeometryStruct): BufferGeometry {
	const geometry = new BufferGeometry();

	geometry.name = struct.name;

	if (struct.index) {
		geometry.setIndex(struct.index);
	}

	for (const key in struct.attributes) {
		geometry.setAttribute(key, struct.attributes[key]);
	}

	for (const group of struct.groups) {
		geometry.addGroup(group.start, group.count, group.materialIndex);
	}

	geometry.setDrawRange(struct.drawRange.start, struct.drawRange.count);
	geometry.userData = struct.userData;
	geometry.boundingBox = struct.boundingBox;
	geometry.boundingSphere = struct.boundingSphere;

	if (struct.boundsTree) {
		geometry.boundsTree = MeshBVH.deserialize(struct.boundsTree, geometry, {
			setIndex: false,
		});
	}

	return geometry;
}

export const BUFFER_GEOMETRY_WORKER_CODEC: WorkerCodec<
	BufferGeometry,
	BufferGeometryDTO
> = map(bufferGeometrySchema, fromStruct, toStruct);

export const BUFFER_GEOMETRY_CACHE_CODEC = defineBinaryCacheCodec({
	id: "THREE.BufferGeometry",
	version: 1,
	dehydrate: (geometry: BufferGeometry) =>
		BUFFER_GEOMETRY_WORKER_CODEC.pack(geometry).payload,
	hydrate: (dto) => BUFFER_GEOMETRY_WORKER_CODEC.unpack(dto),
});
