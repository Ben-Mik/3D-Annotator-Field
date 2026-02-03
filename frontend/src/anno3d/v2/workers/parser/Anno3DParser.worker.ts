import { assertUnreachable } from "~util/TypeScript";
import { createWorkerHost } from "~workers/index";
import { UniversalAnno3DParser } from "../../targets/UniversalAnno3DParser";
import { ANNO3D_PARSER_PROTOCOL } from "./Anno3DParser.protocol";

createWorkerHost(ANNO3D_PARSER_PROTOCOL, async (input, context) => {
	const { labels, source, options } = input;

	let fileData: Uint8Array;

	if (source.type === "buffer") {
		fileData = source.data;
	} else if (source.type === "file") {
		const file = await source.handle.getFile();
		const buffer = await file.arrayBuffer();
		fileData = new Uint8Array(buffer);
	} else if (source.type === "cache") {
		const runtime = context.cache;
		const { scope, resource } = source.access;
		const session = runtime.getSession(scope);

		const buffer = await session.readRaw(resource);

		if (!buffer) {
			throw new Error(
				`[Anno3DParser] Cache resource not found: ${resource.id}`
			);
		}
		fileData = new Uint8Array(buffer);
	} else {
		assertUnreachable(source);
	}

	const parser = new UniversalAnno3DParser(options);
	return parser.parse(fileData, labels);
});
