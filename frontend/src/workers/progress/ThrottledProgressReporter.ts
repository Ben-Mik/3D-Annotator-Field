import { MS_PER_FRAME_20 } from "~util/Screen";
import type { ProgressReporter, ProgressSchema } from "../core/Progress";
import type { ProgressWorkerResponse } from "../runtime/Task";

/**
 * Implementation of ProgressReporter that throttles updates to a specific interval
 * in milliseconds. This prevents flooding of too many postMessage calls.
 *
 * @typeParam P - The ProgressSchema definition.
 */
export class ThrottledProgressReporter<P extends ProgressSchema>
	implements ProgressReporter<P>
{
	private readonly id: number;
	private readonly interval: number;

	private lastExecutionTime = 0;
	private pendingMessage: ProgressWorkerResponse | null = null;

	/**
	 * @param taskId - The ID of the request being executed.
	 * @param interval - Minimum ms between updates (default: 50ms).
	 */
	constructor(taskId: number, interval = MS_PER_FRAME_20) {
		this.id = taskId;
		this.interval = interval;
	}

	/** @inheritdoc */
	public report<K extends keyof P & string>(
		stage: K,
		...args: P[K] extends "dynamic" ? [done: number, total: number] : []
	): void {
		const [done = null, total = null] = args;
		const message: ProgressWorkerResponse = {
			type: "PROGRESS",
			id: this.id,
			payload: { stage, done, total },
		};

		const now = performance.now();

		if (now - this.lastExecutionTime >= this.interval) {
			self.postMessage(message);
			this.lastExecutionTime = now;
			this.pendingMessage = null;
		} else {
			this.pendingMessage = message;
		}
	}

	/** @inheritdoc */
	public flush(): void {
		if (this.pendingMessage) {
			self.postMessage(this.pendingMessage);
			this.pendingMessage = null;
			this.lastExecutionTime = performance.now();
		}
	}
}
