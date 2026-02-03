export type Prettify<T> = {
	[K in keyof T]: T[K];
	// eslint-disable-next-line @typescript-eslint/ban-types
} & {};

export interface NestedRecord<V> {
	[k: string | number | symbol]: V | NestedRecord<V>;
}

/**
 * A nested object
 */
export type NestedObject<T, V> = {
	[K in keyof T]: T[K] extends object ? NestedObject<T[K], V> : V;
};

/**
 * A optional nested object
 */
export type OptionalNestedObject<T, V> = Partial<NestedObject<T, V>>;

export type ExcludeMethods<T> = {
	// eslint-disable-next-line @typescript-eslint/ban-types
	[P in keyof T as T[P] extends Function ? never : P]: T[P];
};

/**
 * Converts a union of types (e.g., number | string) into an intersection
 * (e.g., number & string), which results in `never` if types are different.
 * If types are the same (e.g., number | number), it results in the base type (e.g., number).
 */
export type UnionToIntersection<U> = (
	U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
	? I
	: never;

/**
 * Asserts that a code path is unreachable.
 *
 * This is a utility for exhaustive type checking. If a switch statement
 * handles all members of a union, the `default` case can call this function.
 * If a new member is added to the union, the TypeScript compiler will
 * flag the `assertUnreachable` call as an error. If the function runs during
 * runtime an error is thrown.
 *
 * @param value The value that should be of type `never`.
 * @param error An optional custom error to be thrown.
 * @returns This function never returns; it always throws an error.
 */
export function assertUnreachable(value: never, error?: Error): never {
	if (error) {
		throw error;
	}

	throw new Error(`Unreachable code. Use TypeScript! (${String(value)})`);
}

/**
 * Asserts that a code path is unreachable.
 *
 * This is a utility for exhaustive type checking. If a switch statement
 * handles all members of a union, the `default` case can call this function.
 * If a new member is added to the union, the TypeScript compiler will
 * flag the `assertSoftUnreachable` call as an error. Other than
 * {@link assertUnreachable}, this function does not throw an error if it runs,
 * it only raises the TypeScript error.
 *
 * @param _value The value that should be of type `never`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function assertSoftUnreachable(_value: never): void {}
