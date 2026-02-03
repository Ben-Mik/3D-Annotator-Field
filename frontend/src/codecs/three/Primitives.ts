import { Box3, Sphere as ThreeSphere, Vector3 } from "three";
import {
	array,
	map,
	number,
	struct,
	type InferWire,
} from "~workers/combinators/Combinators";
import type { WorkerCodec } from "~workers/index";

const vector3Schema = array(number); // [x, y, z]

export const VECTOR_3_WORKER_CODEC: WorkerCodec<Vector3, number[]> = map(
	vector3Schema,
	(arr) => new Vector3().fromArray(arr),
	(vector) => vector.toArray()
);

export type Vector3DTO = InferWire<typeof vector3Schema>;

const box3Schema = struct({
	min: VECTOR_3_WORKER_CODEC,
	max: VECTOR_3_WORKER_CODEC,
});

export type Box3DTO = InferWire<typeof box3Schema>;

export const BOX_3_WORKER_CODEC: WorkerCodec<Box3, Box3DTO> = map(
	box3Schema,
	(dto) => new Box3(dto.min, dto.max),
	(box) => ({ min: box.min, max: box.max })
);

const sphereSchema = struct({
	center: VECTOR_3_WORKER_CODEC,
	radius: number,
});

export type SphereDTO = InferWire<typeof sphereSchema>;

export const SPHERE_WORKER_CODEC: WorkerCodec<ThreeSphere, SphereDTO> = map(
	sphereSchema,
	(dto) => new ThreeSphere(dto.center, dto.radius),
	(sphere) => ({ center: sphere.center, radius: sphere.radius })
);
