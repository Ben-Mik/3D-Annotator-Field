import type { Codec } from "./Codec";
import type { KindForScope, Scope } from "./Scope";

/**
 * Defines the identity of a cacheable object.
 *
 * @typeParam S - The specific Scope this resource is associated with.
 */
export interface Resource<S extends Scope> {
	/**
	 * Unique identifier of the resource.
	 */
	readonly id: string;

	/**
	 * Scope kind this resource is keyed by.
	 *
	 * This controls:
	 * - where in the directory hierarchy the file is stored, and
	 * - which scope fields are retained in metadata.
	 */
	readonly scopeKind: KindForScope<S>;
}

/**
 * A Resource that includes a Codec definition, implying a specific
 * runtime data type `Output` (and potentially distinct `Input`) instead
 * of raw binary.
 *
 * @typeParam S - The specific Scope.
 * @typeParam Output - The high-level runtime type produced when reading.
 * @typeParam Input - The type accepted when writing.
 */
export interface TypedResource<S extends Scope, Output, Input = Output>
	extends Resource<S> {
	/**
	 * The codec responsible for serializing/deserializing this resource.
	 */
	readonly codec: Codec<Output, Input>;
}

/**
 * Extract the scope type from a resource descriptor.
 *
 * @typeParam R - Resource type.
 */
export type ScopeOfResource<R extends Resource<Scope>> = R extends Resource<
	infer S
>
	? S
	: never;

/**
 * Helper to extract the Output type (read result) of a TypedResource.
 * @typeParam R - TypedResource type.
 */
export type OutputOfResource<R> = R extends TypedResource<
	Scope,
	infer Output,
	infer _Input
>
	? Output
	: unknown;

/**
 * Helper to extract the Input type (write argument) of a TypedResource.
 * @typeParam R - TypedResource type.
 */
export type InputOfResource<R> = R extends TypedResource<
	Scope,
	infer _Output,
	infer Input
>
	? Input
	: unknown;

/**
 * Restrict a resource type to those that are usable within a given scope.
 *
 * A resource is usable with scope `S` if `S` extends the resource's required
 * scope.
 *
 * @typeParam R - Resource type.
 * @typeParam S - Scope type.
 */
export type ResourceUsableWithScope<
	R extends Resource<Scope>,
	S extends Scope
> = S extends ScopeOfResource<R> ? R : never;
