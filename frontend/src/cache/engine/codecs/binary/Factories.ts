import { BinaryCodec } from "./BinaryCodec";
import type { Cacheable, CacheableClass } from "./Cacheable";
import type { Encodable, Spec } from "./Spec";

/**
 * Creates a `BinaryCodec` using a definition object.
 *
 * Use this method for types you do not control (e.g., library classes)
 * or for simple data structures that are not classes.
 *
 * @example
 * ```ts
 * interface SimpleDTO { data: Float32Array }
 *
 * const simpleCodec = defineBinaryCacheCodec<SimpleData, SimpleDTO>({
 *     id: "SimpleData",
 *     version: 1,
 *     serialize: (data) => ({ data: data.floatArray }),
 *     hydrate: (dto) => ({
 *         floatArray: dto.data, // dto.data is Float32Array
 *         fn: () => true // restore elements that can't be serialized like functions
 *     })
 * });
 * ```
 *
 * @param spec - The configuration object defining how to serialize/hydrate the type.
 * @returns A fully configured BinaryCodec instance.
 */
export function defineBinaryCodec<Output, DTO, Input = Output>(
	spec: Spec<Output, DTO, Input>
): BinaryCodec<Output, DTO, Input> {
	return new BinaryCodec(spec);
}

/**
 * Creates a `BinaryCodec` for simple data structures where the runtime representation
 * is identical to the serialized representation.
 *
 * Use this for POJOs and Arrays where Input, Output, and DTO are all identical.
 *
 * @param id - The unique signature for this data type.
 * @param version - The schema version (defaults to 1).
 * @returns A Codec that passes data through unchanged.
 */
export function createIdentityBinaryCodec<T>(
	id: string,
	version = 1
): BinaryCodec<T, T> {
	return new BinaryCodec({
		id,
		version,
		dehydrate: (data) => data as unknown as Encodable<T>,
		hydrate: (dto) => dto,
	});
}

/**
 * Creates a `BinaryCodec` for a custom class that implements the `Cacheable` pattern.
 *
 * This is the preferred method for domain objects as it keeps serialization logic
 * colocated with the class and allows access to private state.
 *
 * @param Class - The class constructor implementing `CacheableClass`.
 * @returns A fully configured Codec instance.
 */
export function createBinaryCodecFromClass<T extends Cacheable<DTO>, DTO>(
	Class: CacheableClass<T, DTO>
): BinaryCodec<T, DTO> {
	return new BinaryCodec({
		id: Class.CACHE_CODEC_CONFIG.id,
		version: Class.CACHE_CODEC_CONFIG.version,
		dehydrate: (instance) =>
			instance.dehydrate() as unknown as Encodable<DTO>,
		hydrate: (dto) => Class.hydrate(dto),
	});
}

type OutputType<B> = B extends BinaryCodec<infer R, infer _DTO, infer _I>
	? R
	: never;

type DTOType<B> = B extends BinaryCodec<infer _R, infer DTO, infer _I>
	? DTO
	: never;

type InputType<B> = B extends BinaryCodec<infer _R, infer _DTO, infer I>
	? I
	: never;

type OutputShape<S> = { [K in keyof S]: OutputType<S[K]> };
type DTOShape<S> = { [K in keyof S]: DTOType<S[K]> };
type InputShape<S> = { [K in keyof S]: InputType<S[K]> };

/**
 * Creates a composite `BinaryCodec` by combining existing BinaryCodecs for each field.
 *
 * @param id - The unique id for this composite type.
 * @param shape - An object mapping keys of T to BinaryCodecs for those keys.
 * @param version - The schema version (defaults to 1).
 */
export function createCompositeBinaryCodec<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	S extends Record<string, BinaryCodec<any, any, any>>
>(
	id: string,
	shape: S,
	version = 1
): BinaryCodec<OutputShape<S>, DTOShape<S>, InputShape<S>> {
	const keys = Object.keys(shape) as (keyof S)[];

	return new BinaryCodec({
		id,
		version,
		dehydrate(instance) {
			const source = instance;
			const dto = {} as DTOShape<S>;

			for (const key of keys) {
				const codec = shape[key];
				const value = source[key];

				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const result = codec.spec.dehydrate(value);

				dto[key] = result as DTOType<S[typeof key]>;
			}

			return dto as unknown as Encodable<DTOShape<S>>;
		},

		hydrate(compositeDTO) {
			const dto = {} as OutputShape<S>;

			for (const key of keys) {
				const codec = shape[key];
				const value = compositeDTO[key];

				dto[key] = codec.spec.hydrate(value) as OutputType<
					S[typeof key]
				>;
			}

			return dto;
		},
	});
}
