import type { ArrayBufferView } from "~util/TypedArrays";
import type { Codec } from "../core/Codec";

/**
 * Helper to extract the "Rich" (high-level runtime) type from a Codec instance.
 */
type RichType<C> = C extends Codec<infer R, unknown> ? R : never;

/**
 * Helper to extract the "Wire" (transfer/DTO) type from a Codec instance.
 */
type WireType<C> = C extends Codec<unknown, infer W> ? W : never;

/**
 * Helper to extract the "Rich" types for all keys in a shape.
 */
type RichShape<S> = { [K in keyof S]: RichType<S[K]> };

/**
 * Helper to extract the "Wire" types for all keys in a shape.
 */
type WireShape<S> = { [K in keyof S]: WireType<S[K]> };

/**
 * Helper to identify keys in T that allow 'undefined' and make them optional (?).
 */
type OptionalKeys<T> = {
	[K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

/**
 * Helper to identify keys in T that do NOT allow 'undefined'.
 */
type RequiredKeys<T> = {
	[K in keyof T]: undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Utility to infer the "Rich" (Runtime) type from a Codec.
 */
export type Infer<C> = RichType<C>;

/**
 * Utility to infer the "Wire" (DTO) type from a Codec.
 * Useful for defining the shape of data sent over the wire.
 */
export type InferWire<C> = WireType<C>;

/**
 * Helper to safely add transferables to a Set.
 * This automatically handles deduplication of buffers shared across different parts of the state.
 */
function collectTransferables(
	target: Set<Transferable>,
	source: Transferable[]
) {
	for (const item of source) {
		target.add(item);
	}
}

/**
 * Creates a Codec that acts as a pass-through for basic JSON-compatible types.
 *
 * Use this for POJOs, primitives (number, string, boolean), or raw Transferables
 * (like ArrayBuffer) where no transformation is needed.
 *
 * @returns A generic identity Codec.
 */
export function identity<T>(): Codec<T, T> {
	return {
		pack: (data) => ({ payload: data, transfer: [] }),
		unpack: (data) => data,
	};
}

/**
 * Creates a Codec for a raw Transferable object (e.g., ArrayBuffer, MessagePort).
 *
 * This automatically marks the object itself as transferable during packing.
 *
 * @typeParam T - The specific Transferable type.
 */
export function transfer<T extends Transferable>(): Codec<T, T> {
	return {
		pack: (data) => ({ payload: data, transfer: [data] }),
		unpack: (data) => data,
	};
}

/** Codec for `number` (identity alias). */
export const number = identity<number>();

/** Codec for `string` (identity alias). */
export const string = identity<string>();

/** Codec for `boolean` (identity alias). */
export const boolean = identity<boolean>();

/**
 * Creates a Codec for efficient transfer of `ArrayBuffer` views.
 * - If the underlying buffer is an `ArrayBuffer`, it is added to the transfer list
 * (moving ownership, zero-copy).
 * - If the underlying buffer is a `SharedArrayBuffer`, it is NOT transferred
 * (shared access preserved).
 * - Reconstruction is handled automatically by the Structured Clone algorithm.
 */
export function arrayBufferView<T extends ArrayBufferView>(): Codec<T, T> {
	return {
		pack(input) {
			const transfer: Transferable[] = [];

			if (
				input.buffer instanceof ArrayBuffer &&
				!(input.buffer instanceof SharedArrayBuffer)
			) {
				transfer.push(input.buffer);
			}

			return {
				payload: input,
				transfer,
			};
		},

		unpack(wire) {
			return wire;
		},
	};
}

/**
 * Creates a Codec for an optional value (T | undefined).
 */
export function optional<Rich, Wire>(
	codec: Codec<Rich, Wire>
): Codec<Rich | undefined, Wire | undefined> {
	return {
		pack(input) {
			if (input === undefined) {
				return { payload: undefined, transfer: [] };
			}
			return codec.pack(input);
		},
		unpack(wire) {
			if (wire === undefined) {
				return undefined;
			}
			return codec.unpack(wire);
		},
	};
}

/**
 * Creates a Codec for a value that might be null.
 */
export function nullable<Rich, Wire>(
	codec: Codec<Rich, Wire>
): Codec<Rich | null, Wire | null> {
	return {
		pack(input) {
			if (input === null) {
				return { payload: null, transfer: [] };
			}
			return codec.pack(input);
		},
		unpack(wire) {
			if (wire === null) {
				return null;
			}
			return codec.unpack(wire);
		},
	};
}

/**
 * Creates a Codec for an array of items.
 *
 * @param itemCodec - The Codec used for each element in the array.
 * @returns A Codec handling `T[]`.
 */
export function array<Rich, Wire>(
	itemCodec: Codec<Rich, Wire>
): Codec<Rich[], Wire[]> {
	return {
		pack(input) {
			const payload = new Array<Wire>(input.length);
			const transferables = new Set<Transferable>();

			for (let i = 0; i < input.length; i++) {
				const result = itemCodec.pack(input[i]);
				payload[i] = result.payload;
				if (result.transfer.length > 0) {
					collectTransferables(transferables, result.transfer);
				}
			}

			return { payload, transfer: [...transferables] };
		},

		unpack(array) {
			return array.map((wire) => itemCodec.unpack(wire));
		},
	};
}

/**
 * Reconstructs the object type, making keys optional if their value allows undefined.
 */
type SmartStruct<T> = {
	[K in RequiredKeys<T>]: T[K];
} & {
	[K in OptionalKeys<T>]?: T[K];
} extends infer O
	? { [K in keyof O]: O[K] }
	: never;

/**
 * Creates a Codec for a structured object (dictionary).
 */
export function struct<S extends Record<string, Codec<unknown, unknown>>>(
	shape: S
): Codec<SmartStruct<RichShape<S>>, SmartStruct<WireShape<S>>> {
	const keys = Object.keys(shape) as (keyof S)[];

	return {
		pack(input) {
			const source = input as Partial<RichShape<S>>;
			const payload = {} as Partial<WireShape<S>>;
			const transferables = new Set<Transferable>();

			for (const key of keys) {
				const codec = shape[key];
				const value = source[key];

				const result = codec.pack(value);

				payload[key] = result.payload as WireType<S[typeof key]>;
				if (result.transfer.length > 0) {
					collectTransferables(transferables, result.transfer);
				}
			}

			return {
				payload: payload as SmartStruct<WireShape<S>>,
				transfer: [...transferables],
			};
		},

		unpack(wire) {
			const source = wire as Partial<WireShape<S>>;
			const result = {} as Partial<RichShape<S>>;

			for (const key of keys) {
				const codec = shape[key];
				const wireValue = source[key];

				result[key] = codec.unpack(wireValue) as RichType<
					S[typeof key]
				>;
			}

			return result as SmartStruct<RichShape<S>>;
		},
	};
}

/**
 * Creates a Codec for a record with dynamic string keys.
 * Useful for objects where keys are unknown at compile time.
 */
export function record<Rich, Wire>(
	valueCodec: Codec<Rich, Wire>
): Codec<Record<string, Rich>, Record<string, Wire>> {
	return {
		pack(input) {
			const payload: Record<string, Wire> = {};
			const transferables = new Set<Transferable>();

			for (const key in input) {
				const result = valueCodec.pack(input[key]);
				payload[key] = result.payload;
				collectTransferables(transferables, result.transfer);
			}
			return { payload, transfer: [...transferables] };
		},
		unpack(wire) {
			const result: Record<string, Rich> = {};
			for (const key in wire) {
				result[key] = valueCodec.unpack(wire[key]);
			}
			return result;
		},
	};
}

/**
 * Creates a Codec that transforms one type into another.
 * Useful for mapping a raw struct (DTO) to a class instance.
 *
 * @param codec - The underlying codec (usually a struct).
 * @param to - Function to transform the Wire type to the Rich type (Unpack/Hydrate).
 * @param from - Function to transform the Rich type to the Wire type (Pack/Dehydrate).
 */
export function map<Rich, Wire, Intermediate>(
	codec: Codec<Intermediate, Wire>,
	to: (data: Intermediate) => Rich,
	from: (data: Rich) => Intermediate
): Codec<Rich, Wire> {
	return {
		pack(input) {
			const intermediate = from(input);
			return codec.pack(intermediate);
		},
		unpack(wire) {
			const intermediate = codec.unpack(wire);
			return to(intermediate);
		},
	};
}

/**
 * Creates a Codec for a literal value (constant string, number, or boolean).
 * Useful for defining the discriminator field in a tagged union.
 */
export function literal<const T extends string | number | boolean>(
	value: T
): Codec<T, T> {
	return {
		pack(input) {
			if (input !== value) {
				throw new Error(
					`Codec validation error: Expected literal '${String(
						value
					)}', got '${String(input)}'`
				);
			}
			return { payload: value, transfer: [] };
		},
		unpack(wire) {
			if (wire !== value) {
				throw new Error(
					`Codec validation error: Expected literal '${String(
						value
					)}', got '${String(wire)}'`
				);
			}
			return value;
		},
	};
}

/**
 * Creates a Codec that accepts any one of the provided literal values.
 *
 * This is useful for simple configuration enums or flags.
 *
 * @param values - A list of allowed literal values (strings, numbers, or booleans).
 * @returns A Codec that accepts the Union of the provided values.
 *
 * @example
 * ```ts
 * const Mode = union("fast", "balanced", "precise");
 * // Infers type: "fast" | "balanced" | "precise"
 * ```
 */
export function union<const T extends readonly (string | number | boolean)[]>(
	...values: T
): Codec<T[number], T[number]> {
	const allowed = new Set(values);

	return {
		pack(input) {
			if (!allowed.has(input)) {
				throw new Error(
					`Codec validation error: Expected one of [${values.join(
						", "
					)}], got '${String(input)}'`
				);
			}
			return { payload: input, transfer: [] };
		},

		unpack(wire) {
			if (!allowed.has(wire)) {
				throw new Error(
					`Codec validation error: Expected one of [${values.join(
						", "
					)}], got '${String(wire)}'`
				);
			}
			return wire;
		},
	};
}

/**
 * Helper to extract the Union of all Rich types in a generic map of Codecs.
 */
type UnionFromMap<M extends Record<string, Codec<unknown, unknown>>> = {
	[K in keyof M]: Infer<M[K]>;
}[keyof M];

/**
 * Helper to extract the Union of all Wire types in a generic map of Codecs.
 */
type WireUnionFromMap<M extends Record<string, Codec<unknown, unknown>>> = {
	[K in keyof M]: InferWire<M[K]>;
}[keyof M];

/**
 * Creates a Codec for a Discriminated Union (Tagged Union).
 *
 * It uses a specific property (`tag`) in the input object to determine
 * which underlying Codec to use. It enforces that the keys in the `map`
 * match the literal value of the `tag` property in the corresponding Codec.
 *
 * @param tag - The property name used as the discriminator.
 * @param map - A dictionary mapping discriminator values to Codecs.
 *
 * @example
 * ```ts
 * const Shape = taggedUnion("kind", {
 *     // Key "square" MUST match literal("square") inside
 *     square: struct({ kind: literal("square"), size: number }),
 *     rect: struct({ kind: literal("rect"), w: number, h: number }),
 * });
 * ```
 */
export function taggedUnion<
	Tag extends string,
	Map extends Record<string, Codec<unknown, unknown>> & {
		[K in keyof Map]: Codec<{ [P in Tag]: K }, { [P in Tag]: K }>;
	}
>(tag: Tag, map: Map): Codec<UnionFromMap<Map>, WireUnionFromMap<Map>> {
	return {
		pack(input) {
			const discriminator = input[tag];
			const codec = map[discriminator] as Codec<
				UnionFromMap<Map>,
				WireUnionFromMap<Map>
			>;

			if (!codec) {
				throw new Error(
					`[TaggedUnion] Unknown discriminator value: '${String(
						discriminator
					)}' for tag '${tag}'`
				);
			}

			return codec.pack(input);
		},

		unpack(wire) {
			const discriminator = wire[tag];
			const codec = map[discriminator] as Codec<
				UnionFromMap<Map>,
				WireUnionFromMap<Map>
			>;

			if (!codec) {
				throw new Error(
					`[TaggedUnion] Unknown discriminator value: '${String(
						discriminator
					)}' for tag '${tag}'`
				);
			}

			return codec.unpack(wire);
		},
	};
}
