import type { BufferAttribute } from "three";
import { UvFaceRasterizer } from "~annotator/tools/common/texture/UvFaceRasterizer";
import { bufferAttributeFromTransfer } from "~util/Three";
import { assertUnreachable } from "~util/TypeScript";
import type {
	SubWorkerReceive,
	SubWorkerSend,
} from "./FaceCanvasPositionMapper.worker";
import { TextureStatsBuilder } from "./TextureStats";

// --- State ---
let uvAttribute: BufferAttribute;
let canvasWidth: number;
let canvasHeight: number;
let totalFaceCount: number;
let chunkSize: number;
let queue: Int32Array;

/**
 * Handles messages from the orchestrator worker.
 */
onmessage = function ({ data }: MessageEvent<SubWorkerReceive>) {
	const { type } = data;

	if (type === "start-count") {
		canvasWidth = data.canvasWidth;
		canvasHeight = data.canvasHeight;
		totalFaceCount = data.totalFaceCount;
		chunkSize = data.chunkSize;

		uvAttribute = bufferAttributeFromTransfer(data.uvTransfer);
		queue = new Int32Array(data.queueBuffer);

		const rasterizer = new UvFaceRasterizer(
			uvAttribute,
			canvasWidth,
			canvasHeight
		);

		while (true) {
			const faceStart = Atomics.add(queue, 0, chunkSize);
			if (faceStart >= totalFaceCount) {
				break;
			}

			const faceEnd = Math.min(faceStart + chunkSize, totalFaceCount);

			const counts = rasterizer.computeRangeCounts(faceStart, faceEnd);

			const chunkFaceStats =
				TextureStatsBuilder.calculateChunkStats(counts);

			postMessage<SubWorkerSend>(
				{ type: "chunk-counts", faceStart, counts, chunkFaceStats },
				{ transfer: [counts.buffer] }
			);
		}
	} else if (type === "start-write") {
		const { dataBuffer, offsetsBuffer } = data;

		const dataView = new Uint16Array(dataBuffer);
		const offsetsView = new Uint32Array(offsetsBuffer);

		const rasterizer = new UvFaceRasterizer(
			uvAttribute,
			canvasWidth,
			canvasHeight
		);

		while (true) {
			const faceStart = Atomics.add(queue, 0, chunkSize);
			if (faceStart >= totalFaceCount) {
				break;
			}

			const faceEnd = Math.min(faceStart + chunkSize, totalFaceCount);

			const chunkStartOffset = offsetsView[faceStart];

			rasterizer.computeRangeInto(
				faceStart,
				faceEnd,
				dataView,
				chunkStartOffset
			);

			postMessage<SubWorkerSend>({
				type: "chunk-done",
				faceStart,
				faceEnd,
			});
		}

		postMessage<SubWorkerSend>({ type: "done" });
	} else {
		assertUnreachable(type);
	}
};
