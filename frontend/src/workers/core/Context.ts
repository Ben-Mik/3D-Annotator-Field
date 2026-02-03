import type { CacheRuntime } from "~cache/index";
import type { ProgressReporter } from "./Progress";
import type { ProtocolProgressSchema, ValidProtocol } from "./Protocol";

/**
 * Execution context provided to `unpack` operations on the worker thread.
 *
 * This context acts as a bridge to the environment-specific services available
 * in the worker (or main thread), allowing data structures to re-hydrate
 * connections to global state (e.g., re-establishing a Cache Session from a token).
 */
export interface Context<P extends ValidProtocol<P>> {
	/**
	 * The active Cache Runtime instance in the current environment.
	 */
	readonly cache: CacheRuntime;

	/**
	 * Service for reporting task progress back to the main thread.
	 * Includes throttling to prevent message flooding.
	 */
	readonly progressReporter: ProgressReporter<ProtocolProgressSchema<P>>;

	/**
	 * Signal indicating if the task has been aborted by the main thread.
	 * Long-running jobs should check `signal.aborted` periodically
	 * (e.g., using `throwIfAborted(context.signal)`).
	 *
	 * If the task is aborted, the job MUST throw an `AbortError` (DOMException).
	 * This ensures the cancellation is handled cleanly without logging a failure error.
	 */
	readonly signal: AbortSignal;
}
