import type { BufferAttribute } from "three";
import {
	createCompositeBinaryCacheCodec,
	createIdentityBinaryCacheCodec,
	createWorkerCacheRuntime,
	defineTypedModelCacheResource,
	type CacheRuntime,
	type CacheScope,
} from "~cache/index";
import {
	getReadonlySegmentedArrayCacheCodec,
	getReadonlySegmentedArrayWorkerCodec,
	SegmentedArray,
} from "~util/datastructures/SegmentedArray";
import {
	bufferAttributeFromTransfer,
	bufferAttributeToTransfer,
	type BufferAttributeTransferPayload,
} from "~util/Three";
import { createTimeoutProxy } from "~util/Timeout";
import { assertUnreachable } from "~util/TypeScript";
import type {
	TexturePrecalculationWorkerReceive,
	TexturePrecalculationWorkerSend,
} from "./FaceCanvasPositionMapper";
import {
	TextureStatsBuilder,
	type ChunkFaceStats,
	type TextureStats,
} from "./TextureStats";

const SEGMENTED_ARRAY_WORKER_CODEC =
	getReadonlySegmentedArrayWorkerCodec<Uint16Array>();

const RESULT_CODEC = createCompositeBinaryCacheCodec(
	"face-canvas-position-mapper-result",
	{
		canvasPositionsPerFace:
			getReadonlySegmentedArrayCacheCodec<Uint16Array>(),
		textureStats:
			createIdentityBinaryCacheCodec<TextureStats>("texture-stats"),
	}
);

const RESULT_RESOURCE = defineTypedModelCacheResource(
	"face-canvas-position-mapper-result",
	RESULT_CODEC
);

/**
 * Message type sent from the orchestrator to a sub-worker.
 */
export type SubWorkerReceive =
	| {
			type: "start-count";
			uvTransfer: BufferAttributeTransferPayload;
			canvasWidth: number;
			canvasHeight: number;
			totalFaceCount: number;
			chunkSize: number;
			queueBuffer: SharedArrayBuffer; // Int32Array[1]
	  }
	| {
			type: "start-write";
			dataBuffer: SharedArrayBuffer;
			offsetsBuffer: SharedArrayBuffer;
	  };

/**
 * Message type sent from a sub-worker to the orchestrator.
 */
export type SubWorkerSend =
	| {
			type: "chunk-counts";
			faceStart: number;
			counts: Uint32Array;
			chunkFaceStats: ChunkFaceStats;
	  }
	| {
			type: "chunk-done";
			faceStart: number;
			faceEnd: number;
	  }
	| { type: "done" };

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_PROGRESS_INTERVALL_IN_MS = 100;

// --- State ---
let cacheRuntime: CacheRuntime;
let scope: CacheScope;
let canvasWidth: number;
let canvasHeight: number;
let totalFaceCount: number;
let chunkSize: number;
let workerCount: number;
let totalChunks: number;
let uvAttribute: BufferAttribute;
let uvArraySAB: SharedArrayBuffer;
let queueBuffer: SharedArrayBuffer;
let progressThrottled: (p: number, force?: boolean) => void;
let statsBuilder: TextureStatsBuilder;
const workers: Worker[] = [];

// Pass 1 (count) state
let faceItemCounts: Uint32Array;
let receivedCountChunks = 0;
let processedFacesPass1 = 0;

// Pass 2 (write) state
let dataBuffer: SharedArrayBuffer;
let dataBufferView: Uint16Array;
let offsetsBuffer: SharedArrayBuffer;
let offsetsView: Uint32Array;
let receivedWriteChunks = 0;
let processedFacesPass2 = 0;

/**
 * Handles messages from the main thread.
 */
onmessage = async function ({
	data,
}: MessageEvent<TexturePrecalculationWorkerReceive>) {
	switch (data.type) {
		case "start": {
			cacheRuntime = await createWorkerCacheRuntime();
			scope = data.scope;

			canvasWidth = data.canvasWidth;
			canvasHeight = data.canvasHeight;
			uvAttribute = bufferAttributeFromTransfer(data.uvTransfer);
			totalFaceCount = Math.floor(uvAttribute.count / 3);

			const cacheSession = cacheRuntime.getSession(scope);
			if (await cacheSession.has(RESULT_RESOURCE)) {
				// todo: handle null (cache version mismatch...)
				const cachedResult = (await cacheSession.read(
					RESULT_RESOURCE
				))!;

				const { payload, transfer } = SEGMENTED_ARRAY_WORKER_CODEC.pack(
					cachedResult.canvasPositionsPerFace
				);

				console.log(`Retrieved from cache: ${RESULT_RESOURCE.id}`);

				postMessage<TexturePrecalculationWorkerSend>(
					{
						type: "finished",
						segmentedArrayTransfer: payload,
						textureStats: cachedResult.textureStats,
						uvArray: uvAttribute.array,
					},
					{
						transfer: [uvAttribute.array.buffer, ...transfer],
					}
				);
				return;
			}

			if (totalFaceCount <= 0) {
				throw new Error(
					"FaceCanvasPositionMapper.worker: Empty uv attribute."
				);
			}

			if (!crossOriginIsolated) {
				throw new Error(
					"SharedArrayBuffer requires cross-origin isolation."
				);
			}

			// Create a shared version of the UV array
			uvArraySAB = new SharedArrayBuffer(uvAttribute.array.byteLength);
			const uvSharedArray = new Float32Array(uvArraySAB);
			uvSharedArray.set(uvAttribute.array);

			chunkSize = Math.max(
				1,
				Math.floor(data.options?.chunkSize ?? DEFAULT_CHUNK_SIZE)
			);
			totalChunks = Math.ceil(totalFaceCount / chunkSize);

			const cores = Math.floor(navigator.hardwareConcurrency / 2) || 2;
			const maxWorkers = Math.max(
				1,
				Math.min(data.options?.maxWorkers ?? cores, cores)
			);
			workerCount = Math.min(maxWorkers, totalChunks);

			progressThrottled = createTimeoutProxy((p: number) => {
				postMessage<TexturePrecalculationWorkerSend>({
					type: "progress",
					progress: p,
				});
			}, data.options?.progressIntervallInMs ?? DEFAULT_PROGRESS_INTERVALL_IN_MS);

			faceItemCounts = new Uint32Array(totalFaceCount);
			queueBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
			new Int32Array(queueBuffer)[0] = 0;
			receivedCountChunks = 0;
			processedFacesPass1 = 0;

			statsBuilder = new TextureStatsBuilder(canvasWidth, canvasHeight);

			for (let i = 0; i < workerCount; i++) {
				const worker = new Worker(
					new URL(
						"./FaceCanvasPositionMapper.sub.worker.ts",
						import.meta.url
					),
					{ type: "module" }
				);
				workers.push(worker);
				worker.onmessage = async ({
					data,
				}: MessageEvent<SubWorkerSend>) => {
					switch (data.type) {
						case "chunk-counts": {
							faceItemCounts.set(data.counts, data.faceStart);

							statsBuilder.addFaceStats(data.chunkFaceStats);

							receivedCountChunks++;
							processedFacesPass1 += data.counts.length;

							progressThrottled(
								processedFacesPass1 / (totalFaceCount * 2)
							);

							if (receivedCountChunks === totalChunks) {
								startPass2();
							}
							break;
						}

						case "chunk-done": {
							const { faceStart, faceEnd } = data;

							const elementStart = offsetsView[faceStart];
							const elementEnd = offsetsView[faceEnd];
							if (elementStart < elementEnd) {
								statsBuilder.processPixelData(
									dataBufferView.subarray(
										elementStart,
										elementEnd
									)
								);
							}

							receivedWriteChunks++;
							processedFacesPass2 += faceEnd - faceStart;
							progressThrottled(
								0.5 + processedFacesPass2 / (totalFaceCount * 2)
							);

							if (receivedWriteChunks === totalChunks) {
								await finalize();
							}
							break;
						}

						case "done": {
							worker.terminate();
							break;
						}

						default:
							assertUnreachable(data);
					}
				};
				const [uvTransfer, transferables] = bufferAttributeToTransfer(
					uvAttribute,
					uvSharedArray
				);
				worker.postMessage<SubWorkerReceive>(
					{
						type: "start-count",
						uvTransfer,
						canvasWidth,
						canvasHeight,
						totalFaceCount,
						chunkSize,
						queueBuffer,
					},
					transferables
				);
			}
			break;
		}
		default:
			assertUnreachable(data.type);
	}
};

/**
 * Kicks off Pass 2 after all counts have been received.
 */
function startPass2() {
	receivedWriteChunks = 0;
	processedFacesPass2 = 0;

	offsetsBuffer = SegmentedArray.buildOffsets(faceItemCounts, 2);
	offsetsView = new Uint32Array(offsetsBuffer);

	dataBuffer = SegmentedArray.createSharedDataBuffer(
		offsetsView,
		Uint16Array
	);
	dataBufferView = new Uint16Array(dataBuffer);

	// Reset queue
	new Int32Array(queueBuffer)[0] = 0;

	for (const worker of workers) {
		worker.postMessage<SubWorkerReceive>({
			type: "start-write",
			dataBuffer,
			offsetsBuffer,
		});
	}
}

/**
 * Finalizes the build process and sends the result to the main thread.
 */
async function finalize() {
	progressThrottled(1, true); // Force 100%

	const finalArray = SegmentedArray.fromBuffers(
		Uint16Array,
		2,
		dataBuffer,
		offsetsBuffer
	);

	const textureStats = statsBuilder.finalize();

	const cacheSession = cacheRuntime.getSession(scope);
	await cacheSession.write(RESULT_RESOURCE, {
		canvasPositionsPerFace: finalArray,
		textureStats,
	});

	console.log(`Saved to cache: ${RESULT_RESOURCE.id}`);

	const { payload, transfer } = SEGMENTED_ARRAY_WORKER_CODEC.pack(finalArray);

	postMessage<TexturePrecalculationWorkerSend>(
		{
			type: "finished",
			segmentedArrayTransfer: payload,
			textureStats,
			uvArray: uvAttribute.array,
		},
		{
			transfer: [uvAttribute.array.buffer, ...transfer],
		}
	);
}
