import { BUFFER_GEOMETRY_CACHE_CODEC } from "codecs/three/BufferGeometry";
import { defineTypedModelCacheResource } from "~cache/index";

export const BUILDER_RESULT_RESOURCE = defineTypedModelCacheResource(
	"builder-result",
	BUFFER_GEOMETRY_CACHE_CODEC
);
