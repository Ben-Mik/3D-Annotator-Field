import type { ParserResult } from "~anno3d/v2";
import { Anno3DParserTask } from "~anno3d/v2/workers/parser/Anno3DParserTask";
import { Anno3DSerializerTask } from "~anno3d/v2/workers/serializer/Anno3DSerializerTask";
import { defineModelResource } from "~cache/Factories";
import type { CacheRuntime, CacheScope, CacheSession } from "~cache/index";
import type { AnnotationsLUT, Label } from "~entity/Annotation";
import { ModelType } from "~entity/ModelInformation";
import type { Destroyable, SizeableStream } from "~entity/Types";

export const ANNOTATION_FILE_RESOURCE = defineModelResource("annotation-file");

export interface AnnotationFileManager extends Destroyable {
	parserTask: Anno3DParserTask;
	serializerTask: Anno3DSerializerTask;
	hasAnnotationFile(): Promise<boolean>;
	readAnnotationFile(): Promise<SizeableStream>;
	readAnnotationData(): Promise<ParserResult>;
	writeAnnotationFile(data: Uint8Array): Promise<void>;
	writeAnnotationData(
		data: AnnotationsLUT,
		width?: number,
		height?: number
	): Promise<void>;
}

export class CacheBackedAnnotationFileManager implements AnnotationFileManager {
	public readonly parserTask = new Anno3DParserTask();
	public readonly serializerTask = new Anno3DSerializerTask();

	private readonly _session: CacheSession<CacheScope>;
	private readonly _labels: Label[];
	private readonly _modelType: ModelType;

	constructor(
		runtime: CacheRuntime,
		scope: CacheScope,
		labels: Label[],
		modelType: ModelType
	) {
		this._session = runtime.getSession(scope);
		this._labels = labels;
		this._modelType = modelType;
	}

	public async hasAnnotationFile(): Promise<boolean> {
		return this._session.has(ANNOTATION_FILE_RESOURCE);
	}

	/**
	 * Reads the file as a stream without loading it entirely into memory.
	 */
	public async readAnnotationFile(): Promise<SizeableStream> {
		const blob = await this._session.getFile(ANNOTATION_FILE_RESOURCE);
		if (!blob) {
			throw new Error("Annotation file not found in cache.");
		}

		return {
			data: blob.stream(),
			size: blob.size,
		};
	}

	/**
	 * Reads and parses the data using a Worker.
	 */
	public async readAnnotationData(): Promise<ParserResult> {
		if (!(await this._session.has(ANNOTATION_FILE_RESOURCE))) {
			throw new Error("Annotation file not found in cache.");
		}

		return this.parserTask.parseFromCache(
			this._session,
			ANNOTATION_FILE_RESOURCE,
			this._labels,
			{ binary: { inPlace: true, skipValidation: true } }
		);
	}

	/**
	 * Writes a raw pre-existing file buffer to the cache.
	 */
	public async writeAnnotationFile(data: Uint8Array): Promise<void> {
		await this._session.writeRaw(ANNOTATION_FILE_RESOURCE, data);
	}

	/**
	 * Serializes high-level data into the cache using a Worker.
	 */
	public async writeAnnotationData(
		data: AnnotationsLUT,
		width?: number,
		height?: number
	): Promise<void> {
		const model =
			this._modelType === ModelType.TEXTURE_MESH
				? {
						modelType: this._modelType,
						width: width!,
						height: height!,
				  }
				: { modelType: this._modelType };

		const serializerData = {
			annotations: data,
			labels: this._labels,
			...model,
		};

		await this.serializerTask.serializeToCache(
			serializerData,
			this._session,
			ANNOTATION_FILE_RESOURCE,
			{ format: "binary" }
		);
	}

	public destroy(): void {
		this.parserTask.destroy();
		this.serializerTask.destroy();
	}
}
