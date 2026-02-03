/**
 * Type-safe helper to check whether an unknown value is a specific error type.
 *
 * Optionally matches by `name` to distinguish between different
 * {@link DOMException} variants or custom error subclasses.
 *
 * @typeParam T - The concrete error type to narrow to.
 * @param error - The value to test (typically something caught in a `catch` block).
 * @param constructor - The error constructor to test with `instanceof`.
 * @param name - Optional expected `error.name` value.
 * @returns `true` if `error` is an instance of `constructor` and, if provided,
 *          has the matching `name`.
 */
export function isError<T extends Error | DOMException>(
	error: unknown,
	constructor: new (...args: never[]) => T,
	name?: string
): error is T {
	if (!(error instanceof constructor)) {
		return false;
	}

	if (name && error.name !== name) {
		return false;
	}

	return true;
}

/**
 * Creates a reusable type guard for a specific error type (and optional name).
 *
 * This is a convenience wrapper around {@link isError} for defining
 * narrow predicates like `isQuotaExceededError`:
 *
 * ```ts
 * const isQuotaExceededError = createErrorGuard(
 *   DOMException,
 *   "QuotaExceededError"
 * );
 *
 * try {
 *   // ...
 * } catch (error) {
 *   if (isQuotaExceededError(error)) {
 *     // handle quota issue
 *   }
 * }
 * ```
 *
 * @typeParam T - The concrete error type to narrow to.
 * @param constructor - The error constructor to test with `instanceof`.
 * @param name - Optional expected `error.name` value.
 * @returns A predicate function that checks whether a value is the given error type.
 */
export function createErrorGuard<T extends Error | DOMException>(
	constructor: new (...args: never[]) => T,
	name?: string
) {
	return (error: unknown): error is T => {
		return isError(error, constructor, name);
	};
}

/**
 * Checks if an error is an AbortError (DOMException).
 *
 * This is the standard error thrown by AbortSignal/AbortController APIs.
 *
 * @example
 * ```ts
 * try {
 *     await taskHandle;
 * } catch (error) {
 *     if (isAbortError(error)) {
 *         console.log("Task was cancelled by user");
 *         return;
 *     }
 *     throw error; // Rethrow unexpected errors
 * }
 * ```
 */
export const isAbortError = createErrorGuard(DOMException, "AbortError");
