import type { CacheWriter } from "~cache/index";
import { FileHandleWriter } from "~util/fileSystem/FileHandleWriter";
import { createWorkerHost } from "~workers/index";
import type { Serializer } from "../../Serializer";
import { SerializerBinary } from "../../targets/binary/SerializerBinary";
import { SerializerPng } from "../../targets/png/SerializerPng";
import { SerializerUtf8 } from "../../targets/utf8/SerializerUtf8";
import { ANNO3D_SERIALIZER_PROTOCOL } from "./Anno3DSerializer.protocol";

/**
 * Adapts a CacheWriter to the SerializerWriter interface.
 */
export class CacheWriterAdapter {
	constructor(private readonly _writer: CacheWriter) {}

	async write(buffer: ArrayBuffer | ArrayBufferView): Promise<number> {
		const success = await this._writer.write(buffer);
		if (!success) {
			// todo: improve error handling
			throw new Error(
				"CacheWriterAdapter: Failed to write chunk (likely quota exceeded)."
			);
		}
		return buffer.byteLength;
	}

	async close(): Promise<void> {
		const success = await this._writer.close();
		if (!success) {
			throw new Error(
				"CacheWriterAdapter: Failed to commit file to cache."
			);
		}
	}

	async abort(): Promise<void> {
		await this._writer.abort();
	}
}

createWorkerHost(ANNO3D_SERIALIZER_PROTOCOL, async (input, context) => {
	const { data, format, target } = input;

	let serializer: Serializer;
	switch (format.format) {
		case "binary":
			serializer = new SerializerBinary(format);
			break;
		case "utf8":
			serializer = new SerializerUtf8();
			break;
		case "png":
			serializer = new SerializerPng(format);
			break;
	}

	if (target.type === "buffer") {
		const result = await serializer.serialize(data);
		return { type: "buffer", data: new Uint8Array(result) } as const;
	}

	let writer: CacheWriterAdapter | FileHandleWriter;

	if (target.type === "file") {
		const writable = await target.handle.createWritable();
		writer = new FileHandleWriter(writable);
	} else {
		const session = context.cache.getSession(target.access.scope);

		const cacheWriter = await session.openWriter(target.access.resource);

		writer = new CacheWriterAdapter(cacheWriter);
	}

	const bytes = await serializer.serialize(data, writer);
	await writer.close();
	return { type: "bytes", count: bytes } as const;
});
