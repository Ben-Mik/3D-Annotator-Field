import type { BufferAttribute, Mesh as ThreeMesh, TypedArray } from "three";
import type { Scope } from "~cache/core/Scope";
import type { CacheScope } from "~cache/index";
import type { Destroyable } from "~entity/Types";
import { getReadonlySegmentedArrayWorkerCodec } from "~util/datastructures/SegmentedArray";
import { MS_PER_FRAME_60 } from "~util/Screen";
import {
	bufferAttributeToTransfer,
	type BufferAttributeTransferPayload,
} from "~util/Three";
import { assertUnreachable } from "~util/TypeScript";
import type { InferWire } from "~workers/combinators/Combinators";
import type { CanvasPositionsPerFace } from "../../TextureMesh";
import type { TextureStats } from "./TextureStats";

const SEGMENTED_ARRAY_WORKER_CODEC =
	getReadonlySegmentedArrayWorkerCodec<Uint16Array>();

/**
 * Message type sent from the main thread to the orchestrator worker.
 */
export interface TexturePrecalculationWorkerReceive {
	type: "start";
	scope: Scope;
	uvTransfer: BufferAttributeTransferPayload;
	canvasWidth: number;
	canvasHeight: number;
	options?: {
		progressIntervallInMs: number;
		maxWorkers?: number;
		chunkSize?: number;
	};
}

/**
 * Message type sent from the orchestrator worker to the main thread.
 */
export type TexturePrecalculationWorkerSend =
	| {
			type: "progress";
			progress: number;
	  }
	| {
			type: "finished";
			segmentedArrayTransfer: InferWire<
				typeof SEGMENTED_ARRAY_WORKER_CODEC
			>;
			uvArray: TypedArray;
			textureStats: TextureStats;
	  };

/**
 * The final, successful result of the precalculation.
 */
export interface TexturePrecalculationResult {
	canvasPositionsPerFace: CanvasPositionsPerFace;
	textureStats: TextureStats;
}

/**
 * Manages the multi-worker precalculation of UV-to-canvas position mapping.
 *
 * This class spawns a single "orchestrator" worker, which in turn
 * spawns a pool of sub-workers to perform the rasterization in two passes
 * using SharedArrayBuffers.
 */
export class FaceCanvasPositionMapper implements Destroyable {
	private readonly cacheScope: CacheScope;

	private running: boolean;
	private worker: Worker | null;

	/**
	 * Creates a new FaceCanvasPositionMapper.
	 */
	constructor(scope: CacheScope) {
		this.cacheScope = scope;
		this.running = false;
		this.worker = new Worker(
			new URL("./FaceCanvasPositionMapper.worker.ts", import.meta.url),
			{ type: "module" }
		);
		this.worker.onerror = (error) => {
			throw new Error(
				`FaceCanvasPositionMapper: Could not create Web Worker: "${error.message}"`
			);
		};
	}

	/**
	 * Starts the asynchronous build process.
	 *
	 * @param mesh - The three.js mesh containing the 'uv' attribute.
	 * @param canvasWidth - The target canvas width.
	 * @param canvasHeight - The target canvas height.
	 * @returns A promise that resolves with the `TexturePrecalculationResult`.
	 * @throws {Error} If a job is already running or the worker is terminated.
	 */
	public async build(
		mesh: ThreeMesh,
		canvasWidth: number,
		canvasHeight: number
	): Promise<TexturePrecalculationResult> {
		if (this.running) {
			throw new Error("FaceCanvasPositionMapper: Already running job.");
		}

		if (this.worker === null) {
			throw new Error(
				"FaceCanvasPositionMapper: Worker has been terminated."
			);
		}

		const worker = this.worker;
		this.running = true;

		return new Promise((resolve, reject) => {
			worker.onerror = (e) => {
				reject(
					new Error(
						`FaceCanvasPositionMapper: ${e.message} (${e.filename}, ${e.lineno}) `
					)
				);
				this.running = false;
			};

			worker.onmessage = ({
				data,
			}: MessageEvent<TexturePrecalculationWorkerSend>) => {
				switch (data.type) {
					case "progress": {
						console.log(
							`FaceCanvasPositionMapper: Progress ${(
								data.progress * 100
							).toFixed(0)}%`
						);
						break;
					}
					case "finished": {
						this.running = false;

						const {
							uvArray,
							segmentedArrayTransfer,
							textureStats,
						} = data;

						const uvAttribute = mesh.geometry.getAttribute(
							"uv"
						) as BufferAttribute;
						uvAttribute.array = uvArray;

						const canvasPositionsPerFace =
							SEGMENTED_ARRAY_WORKER_CODEC.unpack(
								segmentedArrayTransfer
							);

						resolve({
							canvasPositionsPerFace,
							textureStats,
						});
						worker.onmessage = null;
						break;
					}
					default:
						assertUnreachable(data);
				}
			};

			const uvAttribute = mesh.geometry.getAttribute(
				"uv"
			) as BufferAttribute;
			const [uvTransfer, transferables] =
				bufferAttributeToTransfer(uvAttribute);

			worker.postMessage<TexturePrecalculationWorkerReceive>(
				{
					type: "start",
					scope: this.cacheScope,
					uvTransfer,
					canvasWidth,
					canvasHeight,
					options: {
						progressIntervallInMs: MS_PER_FRAME_60 * 30,
					},
				},
				transferables
			);
		});
	}

	/**
	 * Terminates the orchestrator worker and cleans up resources.
	 * This instance cannot be used after disposal.
	 */
	public destroy(): void {
		if (!this.worker) {
			return;
		}

		this.worker.terminate();
		this.worker = null;
	}
}
