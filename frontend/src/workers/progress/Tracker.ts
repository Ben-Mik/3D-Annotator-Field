import {
	DynamicProgressValue,
	type ProgressReporter,
	type ProgressSchema,
	type ProgressValue,
} from "../core/Progress";

/**
 * Internal callback that receives the normalized global ratio (0.0 to 1.0).
 */
type ProgressCommit = (ratio: number) => void;

/**
 * A utility to split a single progress range into multiple weighted segments.
 *
 * It bridges the gap between "What is happening" (Rich Stages) and "How much is done" (Scalar Ratio).
 *
 * @example
 * **Use Case 1: Main Thread Composition**
 *
 * Combine multiple sequential tasks into one UI progress bar.
 *
 * ```ts
 * // 1. Create Root Tracker connected to UI
 * const tracker = ProgressTracker.fromCallback((p) => {
 *     progressBar.style.width = p.formatPercent();
 * });
 *
 * // 2. Create weighted slices
 * const parseTracker = tracker.slice(0, 0.3);   // 0% -> 30%
 * const saveTracker = tracker.slice(0.3, 1.0);  // 30% -> 100%
 *
 * // 3. Execute Tasks
 * // Pass the listener directly to the task execution
 * await parseTask.execute(data, parseTracker.listener);
 * await saveTask.execute(result, saveTracker.listener);
 * ```
 *
 * @example
 * **Use Case 2: Worker Internal Composition**
 *
 * Hide complex internal steps behind a single "processing" stage.
 *
 * ```ts
 * // Worker Job
 * const job = async (input, context) => {
 *     // Map all updates to the "processing" stage
 *     const tracker = ProgressTracker.fromReporter(context.progressReporter, "processing");
 *
 *     const prep = tracker.slice(0, 0.1);   // 10%
 *     const loop = tracker.slice(0.1, 1.0); // 90%
 *
 *     // ... work ...
 *     prep.update(1, 1); // Reports "processing" at 10%
 *
 *     for (let i = 0; i < items.length; i++) {
 *         // ... work ...
 *         loop.update(i, items.length); // Scales 0-100% of loop to 10-100% of global
 *     }
 * };
 * ```
 */
export class ProgressTracker {
	private readonly _commit: ProgressCommit;
	private readonly _min: number;
	private readonly _range: number;

	/**
	 * Private constructor to enforce factory usage.
	 *
	 * @param commit - Function to call with the calculated global ratio (0-1).
	 * @param min - The start ratio of this tracker's slice (default 0).
	 * @param max - The end ratio of this tracker's slice (default 1).
	 */
	private constructor(commit: ProgressCommit, min = 0, max = 1) {
		this._commit = commit;
		this._min = min;
		this._range = max - min;
	}

	/**
	 * Creates a Root tracker from a callback function.
	 * Useful for driving UI components on the main thread.
	 *
	 * @param onUpdate - Callback receiving a rich `DynamicProgressValue` representing the global progress.
	 * The `stage` will be set to "progress".
	 */
	static fromCallback(
		onUpdate: (
			progress: DynamicProgressValue<ProgressSchema, string>
		) => void
	): ProgressTracker {
		return new ProgressTracker((ratio) => {
			onUpdate(
				new DynamicProgressValue<ProgressSchema, string>(
					"progress",
					ratio,
					1
				)
			);
		});
	}

	/**
	 * Creates a Root tracker from a Worker Host context.
	 *
	 * This maps all sub-progress updates to a SINGLE specific stage provided here.
	 * Effectively "hiding" internal steps under one generic label.
	 *
	 * **Note:** The target `stage` in the protocol MUST be "dynamic".
	 *
	 * @param reporter - The Host reporter.
	 * @param stage - The single stage name to report as.
	 * @param total - Arbitrary total to use for the dynamic updates (default 100).
	 */
	static fromReporter<P extends ProgressSchema, K extends keyof P & string>(
		reporter: ProgressReporter<P>,
		stage: K,
		total = 100
	): ProgressTracker {
		return new ProgressTracker((ratio) => {
			const dynamicReporter = reporter as unknown as {
				report(stage: K, done: number, total: number): void;
			};

			dynamicReporter.report(stage, ratio * total, total);
		});
	}

	/**
	 * Creates a new tracker for a specific slice of this tracker's range.
	 *
	 * @param start - Relative start (0.0 - 1.0) of the parent range.
	 * @param end - Relative end (0.0 - 1.0) of the parent range.
	 * @returns A new tracker instance.
	 */
	slice(start: number, end: number): ProgressTracker {
		if (start < 0 || end > 1 || start > end) {
			throw new Error(
				`[ProgressTracker] Invalid slice range: ${start} to ${end}`
			);
		}
		const absStart = this._min + this._range * start;
		const absEnd = this._min + this._range * end;
		return new ProgressTracker(this._commit, absStart, absEnd);
	}

	/**
	 * Updates the progress.
	 *
	 * @param done - Amount done.
	 * @param total - Total amount.
	 */
	update(done: number, total: number): void {
		const localRatio = total === 0 ? 0 : done / total;
		const clamped = Math.min(1, Math.max(0, localRatio));
		const globalRatio = this._min + clamped * this._range;
		this._commit(globalRatio);
	}

	/**
	 * Updates the progress using a percentage (0-100).
	 */
	updatePercent(percent: number): void {
		this.update(percent, 100);
	}

	/**
	 * Listener designed to be passed directly to `BaseWorkerTask.execute`.
	 *
	 * It bridges the `ProgressValue` (Rich Event) system back to this scalar tracker.
	 *
	 * - If the event is Dynamic: maps its ratio to this tracker's range.
	 * - If the event is Static: ignored.
	 */
	get listener() {
		return (p: ProgressValue<ProgressSchema, string>) => {
			if (p.isDynamic()) {
				this.update(p.done, p.total);
			}
		};
	}
}
