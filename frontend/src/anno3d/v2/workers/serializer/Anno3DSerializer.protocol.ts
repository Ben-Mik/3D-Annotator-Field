import { CACHE_ACCESS_WORKER_CODEC } from "codecs/Cache";
import { COLOR_WORKER_CODEC } from "codecs/Color";
import { FILE_HANDLE_WORKER_CODEC } from "codecs/FileSystem";
import { LABEL_WORKER_CODEC } from "codecs/Label";
import { ModelType } from "~entity/ModelInformation";
import {
	array,
	arrayBufferView,
	boolean,
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

const commonDataFields = {
	annotations: arrayBufferView<Uint8Array>(),
	labels: array(LABEL_WORKER_CODEC),
};

const serializerDataCodec = taggedUnion("modelType", {
	[ModelType.MESH]: struct({
		modelType: literal(ModelType.MESH),
		...commonDataFields,
	}),

	[ModelType.POINT_CLOUD]: struct({
		modelType: literal(ModelType.POINT_CLOUD),
		...commonDataFields,
	}),

	[ModelType.TEXTURE_MESH]: struct({
		modelType: literal(ModelType.TEXTURE_MESH),
		width: number,
		height: number,
		...commonDataFields,
	}),
});

const commonPngOptionFields = {
	format: literal("png"),
	respectLabelVisibility: optional(boolean),
};

const formatOptionsCodec = taggedUnion("format", {
	binary: struct({
		format: literal("binary"),
		neutralClass: optional(number),
		remapNeutralClass: optional(boolean),
	}),

	utf8: struct({
		format: literal("utf8"),
	}),

	png: taggedUnion("mode", {
		annotationClass: struct({
			mode: literal("annotationClass"),
			neutralValue: optional(number),
			...commonPngOptionFields,
		}),

		color: struct({
			mode: literal("color"),
			neutralColor: optional(COLOR_WORKER_CODEC),
			...commonPngOptionFields,
		}),

		blended: struct({
			mode: literal("blended"),
			opacity: optional(number),
			originalColors: arrayBufferView<Uint8ClampedArray>(),
			...commonPngOptionFields,
		}),
	}),
});

export const ANNO3D_SERIALIZER_PROTOCOL = defineWorkerProtocol({
	input: struct({
		data: serializerDataCodec,
		format: formatOptionsCodec,
		target: taggedUnion("type", {
			buffer: struct({ type: literal("buffer") }),
			file: struct({
				type: literal("file"),
				handle: FILE_HANDLE_WORKER_CODEC,
			}),
			cache: struct({
				type: literal("cache"),
				access: CACHE_ACCESS_WORKER_CODEC,
			}),
		}),
	}),

	output: taggedUnion("type", {
		bytes: struct({ type: literal("bytes"), count: number }),
		buffer: struct({
			type: literal("buffer"),
			data: arrayBufferView<Uint8Array>(),
		}),
	}),
});

export type Anno3DSerializerInput = WorkerProtocolInput<
	typeof ANNO3D_SERIALIZER_PROTOCOL
>;

export type Anno3DParserOutput = WorkerProtocolOutput<
	typeof ANNO3D_SERIALIZER_PROTOCOL
>;
