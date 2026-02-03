import type { AnnotationsLUT, Label } from "~entity/Annotation";
import type { ModelType } from "~entity/ModelInformation";
import type { Prettify } from "~util/TypeScript";

export interface Writer {
	write(buffer: ArrayBuffer | ArrayBufferView): Promise<number>;
}

interface SerializerDataBase {
	annotations: AnnotationsLUT;
	labels: Label[];
}

type SerializerDataModelType =
	| {
			modelType: ModelType.MESH | ModelType.POINT_CLOUD;
	  }
	| { modelType: ModelType.TEXTURE_MESH; width: number; height: number };

export type SerializerData = Prettify<
	SerializerDataBase & SerializerDataModelType
>;

/**
 * A Serializer for annotation data.
 */
export interface Serializer {
	/**
	 * Serializes `data` into a new ArrayBuffer.
	 */
	serialize(data: SerializerData): Promise<ArrayBuffer>;
	/**
	 * Serializes `data` using a `Writer`.
	 */
	serialize(data: SerializerData, writer: Writer): Promise<number>;
}
