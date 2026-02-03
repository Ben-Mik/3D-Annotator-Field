import type { Destroyable } from "~entity/Types";

import { assertUnreachable } from "~util/TypeScript";
import {
	DynamicProgressValue,
	StaticProgressValue,
} from "~workers/core/Progress";
import type {
	ProtocolInput,
	ProtocolOutput,
	ProtocolProgress,
	ValidProtocol,
} from "../core/Protocol";

/**
 * Represents a specific request sent to the worker.
 */
export type WorkerRequest =
	| {
			type: "START";
			id: number;
			payload: unknown;
	  }
	| {
			type: "ABORT";
			id: number;
	  };

/**
 * Payload for progress updates sent from the worker.
 */
export type ProgressWorkerResponse = {
	type: "PROGRESS";
	id: number;
	payload: { stage: string; done: number | null; total: number | null };
};

/**
 * Represents a response received from the worker.
 */
export type WorkerResponse =
	| { type: "OK"; id: number; payload: unknown }
	| { type: "ERR"; id: number; error: string }
	| ProgressWorkerResponse;

export type ViteWorkerConstructor = new (options?: WorkerOptions) => Worker;

/**
 * Options for configuring the Worker Task instance.
 */
export interface WorkerTaskOptions {
	/**
	 * A signal to manage the lifecycle of the Worker thread.
	 * If aborted, the Worker is terminated immediately, and all pending
	 * tasks are rejected with an AbortError.
	 */
	signal?: AbortSignal;

	/**
	 * Optional name for the Task (useful for debugging in DevTools).
	 */
	name?: string;
}

/**
 * Options for executing a specific task.
 */
export interface ExecutionOptions {
	/**
	 * An optional signal to abort the specific task execution.
	 * If aborted, the promise rejects with an AbortError.
	 */
	signal?: AbortSignal;
}

export type ProgressCallback<P extends ValidProtocol<P>> = (
	progress: ProtocolProgress<P>
) => void;

/**
 * A handle returned by execute() to allow fluent control and awaiting.
 *
 * It is thenable, so it can be awaited directly.
 */
export interface TaskHandle<P extends ValidProtocol<P>>
	extends PromiseLike<ProtocolOutput<P>> {
	/**
	 * Access to the underlying promise.
	 */
	readonly promise: Promise<ProtocolOutput<P>>;

	/**
	 * Attaches a progress listener to this execution.
	 * @param callback - The function to call on progress updates.
	 * @returns The handle itself for chaining.
	 */
	onProgress(callback: ProgressCallback<P>): this;

	/**
	 * Aborts the task execution.
	 * The promise will reject with an AbortError.
	 *
	 * @param reason - Optional reason for the abort.
	 */
	abort(reason?: string): void;
}

/**
 * Base class for all Worker Tasks running on the main thread.
 *
 * This class manages the worker lifecycle, enforces the `WorkerProtocol`,
 * and handles request/response correlation and progress tracking.
 *
 * @typeParam P - The protocol defining the input/output types and progress stages.
 *
 * @example
 * **1. Define Protocol**
 * ```ts
 * const progressSchema = {
 *     processing: "dynamic"
 * } as const;
 *
 * const myProtocol = {
 *     input: struct({ text: string }),
 *     output: struct({ reversed: string }),
 *     progressSchema
 * };
 * ```
 *
 * **2. Create Host (worker.ts)**
 * ```ts
 * createHost(myProtocol, async (input, context) => {
 *     context.progressReporter.report("processing", 0, 100);
 *     const reversed = input.text.split("").reverse().join("");
 *     context.progressReporter.report("processing", 100, 100);
 *     return { reversed };
 * });
 * ```
 *
 * **3. Implement Task**
 * ```ts
 * // import using vite
 * import MyTaskWorker from "./MyTask.worker.ts?worker";
 *
 * class MyTask extends BaseWorkerTask<typeof myProtocol> {
 *     constructor() {
 *         super(MyTaskWorker, MyProtocol);
 *     }
 *
 *     run(text: string) {
 *         return this.execute({ text });
 *     }
 * }
 * ```
 *
 * **4. Usage**
 * ```ts
 * const task = new MyTask();
 *
 * // standard usage
 * const result = await task.run("Hello");
 *
 * // usage with Handle
 * const handle = task.run("Hello")
 *     .onProgress(p => console.log(p.percent));
 *
 * handle.abort(); // cancels the task
 * ```
 */
export abstract class BaseWorkerTask<P extends ValidProtocol<P>>
	implements Destroyable
{
	private readonly _protocol: P;
	private _worker: Worker | null;
	private readonly _name: string;

	private _nextRequestId = 0;
	private readonly _pendingRequests = new Map<
		number,
		{
			resolve: (value: ProtocolOutput<P>) => void;
			reject: (err: unknown) => void;
			onProgress?: ProgressCallback<P>;
		}
	>();

	/**
	 * Creates a new Worker Task.
	 *
	 * @param WorkerClass - The class constructor imported via the '?worker' suffix.
	 * @param protocol - The protocol definition used to encode/decode messages.
	 * @param options - Lifecycle options for the worker.
	 */
	constructor(
		WorkerClass: ViteWorkerConstructor,
		protocol: P,
		options?: WorkerTaskOptions
	) {
		this._protocol = protocol;
		this._name = options?.name ?? "AnonymousWorkerTask";

		this._worker = new WorkerClass({
			type: "module",
			name: options?.name,
		});

		this._worker.onmessage = this._onMessage.bind(this);
		this._worker.onerror = this._onError.bind(this);

		if (options?.signal) {
			if (options.signal.aborted) {
				this.terminate(options.signal.reason);
			} else {
				options.signal.addEventListener(
					"abort",
					() => {
						this.terminate(options.signal!.reason);
					},
					{ once: true }
				);
			}
		}
	}

	/**
	 * Executes the task on the worker thread.
	 *
	 * This method packs the input according to the protocol, transfers ownership
	 * of any transferables, and waits for the worker's response.
	 *
	 * @param input - The structured input for the task.
	 * @param options - Execution options (e.g. AbortSignal).
	 * @returns A fluent TaskHandle.
	 */
	protected execute(
		input: ProtocolInput<P>,
		options?: ExecutionOptions
	): TaskHandle<P> {
		if (this._worker === null) {
			throw new Error(`[WorkerTask:${this._name}] Worker is terminated.`);
		}

		let onProgressCallback: ProgressCallback<P> | undefined;

		const id = this._nextRequestId++;

		const promise = new Promise<ProtocolOutput<P>>((resolve, reject) => {
			if (this._worker === null) {
				reject(
					new Error(
						`[WorkerTask:${this._name}] Worker is terminated.`
					)
				);
				return;
			}

			if (options?.signal?.aborted) {
				reject(this._createAbortError(options.signal.reason, id));
				return;
			}

			let packed;
			try {
				packed = this._protocol.input.pack(input);
			} catch (error) {
				reject(
					new Error(
						`[WorkerTask:${this._name}] Failed to pack input: ${
							error instanceof Error
								? error.message
								: String(error)
						}`
					)
				);
				return;
			}

			this._pendingRequests.set(id, {
				resolve,
				reject,
				get onProgress() {
					return onProgressCallback;
				},
			});

			if (options?.signal) {
				options.signal.addEventListener(
					"abort",
					() => {
						this._triggerAbort(id, options.signal!.reason);
					},
					{
						once: true,
					}
				);
			}

			const request: WorkerRequest = {
				type: "START",
				id,
				payload: packed.payload,
			};
			this._worker.postMessage(request, packed.transfer);
		});

		const handle: TaskHandle<P> = {
			promise,
			then: (onfulfilled, onrejected) =>
				promise.then(onfulfilled, onrejected),
			onProgress: (callback) => {
				onProgressCallback = callback;
				return handle;
			},
			abort: (reason = "Aborted by user") => {
				this._triggerAbort(id, reason);
			},
		};

		return handle;
	}

	/**
	 * Terminates the underlying worker immediately.
	 * All pending requests are rejected with an AbortError (or the provided reason).
	 *
	 * @param reason - The reason for termination (passed to rejected promises).
	 */
	public terminate(reason?: unknown): void {
		if (this._worker === null) {
			return;
		}

		this._worker.terminate();
		this._worker = null;

		const error = this._createAbortError(reason);

		for (const { reject } of this._pendingRequests.values()) {
			reject(error);
		}
		this._pendingRequests.clear();
	}

	/**
	 * Alias for terminate(), satisfying the Destroyable interface.
	 */
	public destroy(): void {
		this.terminate("Worker destroyed");
	}

	/**
	 * Handles incoming messages from the worker.
	 */
	private _onMessage(event: MessageEvent<WorkerResponse>) {
		const data = event.data;
		const pending = this._pendingRequests.get(data.id);

		if (!pending) {
			if (data.type === "ERR") {
				console.warn(
					`[WorkerTask:${this._name}] Ignored error for unknown ID ${data.id}:`,
					data.error
				);
			}
			return;
		}

		switch (data.type) {
			case "PROGRESS":
				if (pending.onProgress) {
					const { stage, done, total } = data.payload;

					const isDynamic =
						typeof done === "number" && typeof total === "number";

					const event = isDynamic
						? new DynamicProgressValue(stage, done, total)
						: new StaticProgressValue(stage);

					pending.onProgress(event as ProtocolProgress<P>);
				}
				break;

			case "OK":
				this._pendingRequests.delete(data.id);
				try {
					const result = this._protocol.output.unpack(data.payload);
					pending.resolve(result);
				} catch (error) {
					pending.reject(
						new Error(
							`[WorkerTask:${
								this._name
							}] Failed to unpack output: ${
								error instanceof Error
									? error.message
									: String(error)
							}`
						)
					);
				}
				break;

			case "ERR":
				this._pendingRequests.delete(data.id);
				pending.reject(new Error(data.error));
				break;

			default:
				assertUnreachable(data);
		}
	}

	/**
	 * Handles global worker errors (e.g. startup failure).
	 */
	private _onError(event: ErrorEvent) {
		if (this._worker) {
			this._worker.terminate();
			this._worker = null;
		}

		const message = `[WorkerTask:${this._name}] Worker crashed: ${event.message}`;

		console.error(message);

		const error = new Error(message);
		for (const { reject } of this._pendingRequests.values()) {
			reject(error);
		}

		this._pendingRequests.clear();
	}

	private _triggerAbort(id: number, reason: unknown) {
		const pending = this._pendingRequests.get(id);
		if (pending) {
			const error = this._createAbortError(reason, id);
			pending.reject(error);
			this._pendingRequests.delete(id);
		}

		if (this._worker) {
			const message: WorkerRequest = { type: "ABORT", id };
			this._worker.postMessage(message);
		}
	}

	private _createAbortError(reason?: unknown, id?: number) {
		const prefix = `[WorkerTask:${this._name}]${id ? `(id:${id})` : ""} `;
		return new DOMException(
			typeof reason === "string"
				? prefix + reason
				: reason instanceof Error
				? prefix + reason.message
				: prefix + "Aborted",
			"AbortError"
		);
	}
}
