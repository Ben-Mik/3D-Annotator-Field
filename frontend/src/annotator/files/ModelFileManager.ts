import { defineTypedModelResource } from "~cache/Factories";
import {
	asFile,
	defineBinaryCacheCodec,
	type CacheRuntime,
	type CacheScope,
	type CacheSession,
} from "~cache/index";
import type { FileData } from "~entity/Types";

interface CachedFiles {
	files: File[];
}

interface CachedFilesInput {
	data: FileData[];
}

export const MODEL_FILES_CODEC = defineBinaryCacheCodec<
	CachedFiles,
	CachedFiles,
	CachedFilesInput
>({
	id: "Model.Files",
	version: 2,
	dehydrate: (input) => ({
		files: input.data.map((item) => asFile(item.data, item.name)),
	}),
	hydrate: (dto) => dto,
});

export const MODEL_FILES_RESOURCE = defineTypedModelResource(
	"model-files",
	MODEL_FILES_CODEC
);

export interface ModelFileManager {
	hasModelFiles(): Promise<boolean>;
	readModelFiles(): Promise<File[]>;
	writeModelFiles(files: FileData[]): Promise<void>;
}

export class CacheBackedModelFileManager implements ModelFileManager {
	private readonly _session: CacheSession<CacheScope>;

	constructor(runtime: CacheRuntime, scope: CacheScope) {
		this._session = runtime.getSession(scope);
	}

	public async hasModelFiles(): Promise<boolean> {
		return this._session.has(MODEL_FILES_RESOURCE);
	}

	public async readModelFiles(): Promise<File[]> {
		const result = await this._session.read(MODEL_FILES_RESOURCE);
		if (result === null) {
			return [];
		}
		return result.files;
	}

	public async writeModelFiles(files: FileData[]): Promise<void> {
		await this._session.write(MODEL_FILES_RESOURCE, { data: files });
	}
}
