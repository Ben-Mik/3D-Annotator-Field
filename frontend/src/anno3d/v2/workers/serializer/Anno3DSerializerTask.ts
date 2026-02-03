import type { ResourceUsableWithScope } from "~cache/core/Resource";
import {
	type CacheResource,
	type CacheScope,
	type CacheSession,
} from "~cache/index";
import type { Prettify } from "~util/TypeScript";
import { BaseWorkerTask } from "~workers/index";
import type { WorkerTaskOptions } from "~workers/runtime/Task";
import type { SerializerData } from "../../Serializer";
import {
	ANNO3D_SERIALIZER_PROTOCOL,
	type Anno3DSerializerInput,
} from "./Anno3DSerializer.protocol";
import Anno3dSerializerWorker from "./Anno3DSerializer.worker.ts?worker";

export type SerializerFormatOptions = Prettify<Anno3DSerializerInput["format"]>;

export class Anno3DSerializerTask extends BaseWorkerTask<
	typeof ANNO3D_SERIALIZER_PROTOCOL
> {
	constructor(options?: WorkerTaskOptions) {
		super(Anno3dSerializerWorker, ANNO3D_SERIALIZER_PROTOCOL, {
			name: "Anno3DSerializerTask",
			...options,
		});
	}

	public async serializeToBuffer(
		data: SerializerData,
		format: SerializerFormatOptions
	): Promise<Uint8Array> {
		const result = await this.execute({
			data,
			format,
			target: {
				type: "buffer",
			},
		});

		if (result.type === "buffer") {
			return result.data;
		}

		throw new Error(
			`[Anno3DSerializerTask] Unexpected return type '${result.type}' for memory target.`
		);
	}

	public async serializeToFile(
		data: SerializerData,
		handle: FileSystemFileHandle,
		format: SerializerFormatOptions
	): Promise<number> {
		const result = await this.execute({
			data,
			format,
			target: {
				type: "file",
				handle,
			},
		});

		if (result.type === "bytes") {
			return result.count;
		}

		throw new Error(
			`[Anno3DSerializerTask] Unexpected return type '${result.type}' for file target.`
		);
	}

	public async serializeToCache<
		R extends CacheResource<CacheScope>,
		S extends CacheScope
	>(
		data: SerializerData,
		session: CacheSession<S>,
		resource: ResourceUsableWithScope<R, S>,
		format: SerializerFormatOptions
	): Promise<number> {
		const result = await this.execute({
			data,
			format,
			target: {
				type: "cache",
				access: {
					scope: session.scope,
					resource,
				},
			},
		});

		if (result.type === "bytes") {
			return result.count;
		}
		throw new Error(
			`[Anno3DSerializerTask] Unexpected return type '${result.type}' for cache target.`
		);
	}
}
