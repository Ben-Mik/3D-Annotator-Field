import { CACHE_ACCESS_WORKER_CODEC } from "codecs/Cache";
import { FILE_HANDLE_WORKER_CODEC } from "codecs/FileSystem";
import { LABEL_WORKER_CODEC } from "codecs/Label";
import { result } from "codecs/Neverthrow";
import { type ParserError } from "~anno3d/v2";
import type { Anno3DParserOptions } from "~anno3d/v2/targets/UniversalAnno3DParser";
import { ModelType } from "~entity/ModelInformation";
import {
	array,
	arrayBufferView,
	identity,
	literal,
	number,
	optional,
	struct,
	taggedUnion,
} from "~workers/combinators/Combinators";
import {
	defineWorkerProtocol,
	type WorkerProtocolInput,
	type WorkerProtocolOutput,
} from "~workers/index";

const commonFields = {
	annotations: arrayBufferView<Uint8Array>(),
};

const parserDataCodec = taggedUnion("modelType", {
	[ModelType.MESH]: struct({
		modelType: literal(ModelType.MESH),
		...commonFields,
	}),

	[ModelType.POINT_CLOUD]: struct({
		modelType: literal(ModelType.POINT_CLOUD),
		...commonFields,
	}),

	UNKNOWN: struct({
		modelType: literal("UNKNOWN"),
		...commonFields,
	}),

	[ModelType.TEXTURE_MESH]: struct({
		modelType: literal(ModelType.TEXTURE_MESH),
		width: number,
		height: number,
		...commonFields,
	}),
});

const parserErrorCodec = identity<ParserError>(); // ParserError is a POJO

export const ANNO3D_PARSER_PROTOCOL = defineWorkerProtocol({
	input: struct({
		labels: array(LABEL_WORKER_CODEC),
		source: taggedUnion("type", {
			buffer: struct({
				type: literal("buffer"),
				data: arrayBufferView<Uint8Array>(),
			}),
			file: struct({
				type: literal("file"),
				handle: FILE_HANDLE_WORKER_CODEC,
			}),
			cache: struct({
				type: literal("cache"),
				access: CACHE_ACCESS_WORKER_CODEC,
			}),
		}),
		options: optional(identity<Anno3DParserOptions>()),
	}),

	output: result({ ok: parserDataCodec, err: parserErrorCodec }),
});

export type Anno3DParserInput = WorkerProtocolInput<
	typeof ANNO3D_PARSER_PROTOCOL
>;
export type Anno3DParserOutput = WorkerProtocolOutput<
	typeof ANNO3D_PARSER_PROTOCOL
>;
