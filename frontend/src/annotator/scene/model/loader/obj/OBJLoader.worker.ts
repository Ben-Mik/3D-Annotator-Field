import { type BufferGeometry, type Group, type Mesh as ThreeMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";
import { humanReadableDataSize } from "~util/fileSystem/FileUtils";
import { createTimeoutProxy } from "~util/Timeout";
import { findArrayBuffers } from "~util/Util";
import {
	MAX_UTF8_FILE_LENGTH,
	type LoaderWorkerReceive,
	type LoaderWorkerSend,
} from "../Loader";
import { BigFileOBJLoader } from "./BigFileOBJLoader";

/**
 * The worker theoretically supports files sizes way bigger than {@link MAX_UTF8_FILE_LENGTH}
 * by extracting the file content without loading the whole file into a single string.
 * This unfortunately leads to out of memory errors in many browsers caused by the
 * three.js OBJLoader.
 */
onmessage = async function ({ data }: MessageEvent<LoaderWorkerReceive>) {
	const { modelFile, options } = data;

	let modelURL;

	try {
		if (modelFile.size > MAX_UTF8_FILE_LENGTH) {
			const size = humanReadableDataSize(modelFile.size);
			console.warn(
				`OBJLoader: Parsing a big file (${size}) may lead to out of memory errors!`
			);
		}

		const loader = new BigFileOBJLoader();
		modelURL = URL.createObjectURL(modelFile);
		const onProgress = options.hasProgressObserver
			? // don't call postMessage on every progress update
			  createTimeoutProxy((progress: ProgressEvent) => {
					postMessage<LoaderWorkerSend>({
						progress: { ...progress },
					});
			  })
			: undefined;

		const group = await loader.loadAsync(modelURL, onProgress);

		let geometry = mergeGroup(group);
		if (geometry.index !== null) {
			geometry = geometry.toNonIndexed();
		}

		postMessage<LoaderWorkerSend>(
			{
				geometryClone: geometry,
			},
			{ transfer: findArrayBuffers(geometry.attributes) }
		);
	} catch (error) {
		postMessage<LoaderWorkerSend>({ error });
	} finally {
		if (modelURL) {
			URL.revokeObjectURL(modelURL);
		}
	}
};

function mergeGroup(group: Group) {
	const meshes = group.children as ThreeMesh[];
	const geometryArray: BufferGeometry[] = [];
	for (const mesh of meshes) {
		geometryArray.push(mesh.geometry);
	}
	return mergeGeometries(geometryArray);
}
