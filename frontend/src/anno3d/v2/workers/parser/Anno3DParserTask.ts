import type { Parser, ParserResult } from "~anno3d/v2/Parser";
import type { ResourceUsableWithScope } from "~cache/core/Resource";
import {
	type CacheResource,
	type CacheScope,
	type CacheSession,
} from "~cache/index";
import { type Label } from "~entity/Annotation";
import { BaseWorkerTask } from "~workers/index";
import type { WorkerTaskOptions } from "~workers/runtime/Task";
import type { Anno3DParserOptions } from "../../targets/UniversalAnno3DParser";
import { ANNO3D_PARSER_PROTOCOL } from "./Anno3DParser.protocol";
import Anno3dParserWorker from "./Anno3DParser.worker.ts?worker";

export class Anno3DParserTask
	extends BaseWorkerTask<typeof ANNO3D_PARSER_PROTOCOL>
	implements Parser
{
	constructor(options?: WorkerTaskOptions) {
		super(Anno3dParserWorker, ANNO3D_PARSER_PROTOCOL, {
			name: "Anno3DParserTask",
			...options,
		});
	}

	public async parse(
		data: Uint8Array,
		labels: Label[],
		options?: Anno3DParserOptions
	): Promise<ParserResult> {
		return this.execute({
			source: {
				type: "buffer",
				data,
			},
			labels,
			options,
		});
	}

	public async parseFromFile(
		handle: FileSystemFileHandle,
		labels: Label[],
		options?: Anno3DParserOptions
	): Promise<ParserResult> {
		return this.execute({
			source: {
				type: "file",
				handle,
			},
			labels,
			options,
		});
	}

	public async parseFromCache<
		R extends CacheResource<CacheScope>,
		S extends CacheScope
	>(
		session: CacheSession<S>,
		resource: ResourceUsableWithScope<R, S>,
		labels: Label[],
		options?: Anno3DParserOptions
	): Promise<ParserResult> {
		return this.execute({
			source: {
				type: "cache",
				access: {
					scope: session.scope,
					resource,
				},
			},
			labels,
			options,
		});
	}
}
