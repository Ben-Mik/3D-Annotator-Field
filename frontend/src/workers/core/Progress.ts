/**
 * Defines the type of progress reporting for a specific stage.
 * - `static`: Indeterminate progress (spinner).
 * - `dynamic`: Determinate progress (0% to 100%).
 */
export type ProgressType = "static" | "dynamic";

/**
 * A schema defining the progress stages and their types.
 *
 * @example
 * ```ts
 * type MyProgressSchema = {
 *     parsing: "static";
 *     processing: "dynamic";
 * };
 * ```
 */
export type ProgressSchema = Record<string, ProgressType>;

/**
 * Utility to generate the actual type of the runtime object emitted by a Task.
 * This is the Union Type of all possible progress events defined in a Schema.
 */
export type TaskProgress<S> = S extends ProgressSchema
	? {
			[K in keyof S & string]: S[K] extends "dynamic"
				? DynamicProgressValue<S, K>
				: StaticProgressValue<S, K>;
	  }[keyof S & string]
	: never;

/**
 * Base class for a progress update.
 *
 * @typeParam P - The ProgressSchema definition from the Protocol.
 * @typeParam K - The specific stage key (e.g., "parsing").
 */
export abstract class ProgressValue<
	P extends ProgressSchema,
	K extends keyof P & string = keyof P & string
> {
	/** The stage identifier. */
	public readonly stage: K;

	constructor(stage: K) {
		this.stage = stage;
	}

	/**
	 * Returns true if this is a dynamic progress update (has done/total).
	 */
	public abstract isDynamic(): this is DynamicProgressValue<P, K>;

	/**
	 * Returns true if this is a static progress update (indeterminate).
	 */
	public abstract isStatic(): this is StaticProgressValue<P, K>;
}

/**
 * Represents a "spinner" state: we are working on `stage`, but don't know % done.
 */
export class StaticProgressValue<
	P extends ProgressSchema,
	K extends keyof P & string
> extends ProgressValue<P, K> {
	/** @inheritdoc */
	public isDynamic(): this is DynamicProgressValue<P, K> {
		return false;
	}

	/** @inheritdoc */
	public isStatic(): this is StaticProgressValue<P, K> {
		return true;
	}
}

/**
 * Represents a "progress bar" state: we know `done` and `total`.
 */
export class DynamicProgressValue<
	P extends ProgressSchema,
	K extends keyof P & string
> extends ProgressValue<P, K> {
	/** Amount of work completed. */
	public readonly done: number;
	/** Total amount of work to be done. */
	public readonly total: number;

	/**
	 * @param stage - The stage identifier.
	 * @param done - Work completed.
	 * @param total - Total work.
	 */
	constructor(stage: K, done: number, total: number) {
		super(stage);
		this.done = done;
		this.total = total;
	}

	/** The progress ratio from 0.0 to 1.0. */
	public get ratio(): number {
		return this.total === 0 ? 0 : this.done / this.total;
	}

	/** The progress percentage from 0 to 100. */
	public get percent(): number {
		return this.ratio * 100;
	}

	/**
	 * Formats the ratio as a fixed-point string.
	 * @param decimals - Number of decimal places (default: 2).
	 */
	public format(decimals = 2): string {
		return `${this.ratio.toFixed(decimals)}`;
	}

	/**
	 * Formats the percentage with a "%" suffix.
	 * @param decimals - Number of decimal places (default: 0).
	 */
	public formatPercent(decimals = 0): string {
		return `${this.percent.toFixed(decimals)}%`;
	}

	/** @inheritdoc */
	public isDynamic(): this is DynamicProgressValue<P, K> {
		return true;
	}

	/** @inheritdoc */
	public isStatic(): this is StaticProgressValue<P, K> {
		return false;
	}
}

/**
 * Interface for reporting progress from the Worker.
 */
export interface ProgressReporter<P extends ProgressSchema> {
	/**
	 * Report progress for a specific stage.
	 *
	 * - If the stage is "static", only the stage key is required.
	 * - If the stage is "dynamic", `done` and `total` are required.
	 *
	 * @param stage - The stage identifier.
	 * @param args - [done, total] if dynamic, empty if static.
	 */
	report<K extends keyof P & string>(
		stage: K,
		...args: P[K] extends "dynamic" ? [done: number, total: number] : []
	): void;

	/**
	 * Force send the last reported progress message immediately.
	 * Useful before long synchronous operations or at the end of a task.
	 */
	flush(): void;
}
