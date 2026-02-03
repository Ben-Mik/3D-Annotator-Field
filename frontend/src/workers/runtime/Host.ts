import { createWorkerCacheRuntime } from "~cache/index";
import { isAbortError } from "~util/Error";
import { ThrottledProgressReporter } from "~workers/progress/ThrottledProgressReporter";
import type { Context } from "../core/Context";
import type {
	ProtocolInput,
	ProtocolOutput,
	ProtocolProgressSchema,
	ValidProtocol,
} from "../core/Protocol";
import type { WorkerRequest, WorkerResponse } from "./Task";

/**
 * The logic to execute for a task.
 *
 * **Abort Handling:**
 * The job receives a `context.signal` (AbortSignal). Long-running jobs should check
 * this signal periodically (e.g., using `throwIfAborted(context.signal)`).
 *
 * If the task is aborted, the job MUST throw an `AbortError` (DOMException).
 * This ensures the cancellation is handled cleanly without logging a failure error.
 */
export type Job<P extends ValidProtocol<P>> = (
	input: ProtocolInput<P>,
	context: Context<P>
) => Promise<ProtocolOutput<P>>;

type JobMap = Map<number, AbortController>;

/**
 * Creates the host environment inside the worker thread.
 *
 * This function initializes the Cache Runtime, listens for incoming messages,
 * decodes them using the protocol, executes the job, and sends back the result.
 * It also sets up the AbortController for cooperative cancellation.
 *
 * **Abort Handling:**
 * The job receives a `context.signal` (AbortSignal). Long-running jobs should check
 * this signal periodically (e.g., using `throwIfAborted(context.signal)`).
 *
 * If the task is aborted, the job MUST throw an `AbortError` (DOMException).
 * This ensures the cancellation is handled cleanly without logging a failure error.
 *
 * @typeParam P - The protocol definition.
 * @param protocol - The protocol instance.
 * @param job - The actual logic to execute.
 */
export function createHost<P extends ValidProtocol<P>>(
	protocol: P,
	job: Job<P>
): void {
	const logPrefix = `[WorkerHost:${self.name || "AnonymousWorker"}]`;

	const runtimePromise = createWorkerCacheRuntime().catch((err) => {
		console.error(logPrefix + " Failed to initialize Cache Runtime:", err);
		throw err;
	});

	const runningJobs: JobMap = new Map();

	self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
		const request = event.data;
		const { id } = request;

		if (request.type === "ABORT") {
			const controller = runningJobs.get(id);
			if (controller) {
				controller.abort();
				teardown(runningJobs, id);
			} else {
				console.warn(
					`${logPrefix} Received abort message for unknown job (id: ${id}).`
				);
			}
			return;
		}

		const { payload } = request;

		const runtime = await runtimePromise;
		const reporter = new ThrottledProgressReporter<
			ProtocolProgressSchema<P>
		>(id);
		const abortController = new AbortController();

		runningJobs.set(id, abortController);

		const context: Context<P> = {
			cache: runtime,
			progressReporter: reporter,
			signal: abortController.signal,
		};

		let input: ProtocolInput<P>;
		try {
			input = protocol.input.unpack(payload);
		} catch (error) {
			teardown(runningJobs, id);
			sendError(id, logPrefix, "Protocol Unpack Error", error);
			return;
		}

		let result: ProtocolOutput<P>;
		try {
			await yieldControl();
			throwIfAborted(context.signal);

			result = await job(input, context);

			await yieldControl();
			throwIfAborted(context.signal);
		} catch (error) {
			if (!isAbortError(error)) {
				sendError(id, logPrefix, "Job Execution Failed", error);
			}

			teardown(runningJobs, id);
			return;
		}

		reporter.flush();

		let packed;
		try {
			packed = protocol.output.pack(result);
		} catch (error) {
			sendError(id, logPrefix, "Protocol Pack Error", error);
			teardown(runningJobs, id);
			return;
		}

		self.postMessage<WorkerResponse>(
			{ type: "OK", id, payload: packed.payload },
			{ transfer: packed.transfer }
		);

		teardown(runningJobs, id);
	};
}

function teardown(jobs: JobMap, id: number) {
	jobs.delete(id);
}

/**
 * Helper to send an error response back to the main thread.
 */
function sendError(
	id: number,
	prefix: string,
	message: string,
	error: unknown
) {
	const errorAsString =
		error instanceof Error ? error.message : String(error);
	self.postMessage<WorkerResponse>({
		type: "ERR",
		id,
		error: `${prefix} ${message}: ${errorAsString}`,
	});
}

/**
 * Yields control back to the event loop, allowing incoming messages
 * to be processed.
 *
 * Use this inside tight synchronous loops to keep the worker responsive.
 */
export function yieldControl(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Checks if the signal is aborted and throws an AbortError if so.
 *
 * Use this inside your worker tasks to stop execution when an abort is requested.
 *
 * @param signal - The signal to check.
 * @throws {DOMException} "AbortError" if the signal is aborted.
 */
export function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new DOMException("Aborted", "AbortError");
	}
}
