import { type Infer } from "../combinators/Combinators";
import type { Codec } from "./Codec";
import type { ProgressSchema, TaskProgress } from "./Progress";

/**
 * Defines the strict contract for communication between the main thread and a worker.
 *
 * A Protocol consists of:
 * - `input`: Codec for data sent **to** the worker (Job arguments).
 * - `output`: Codec for data sent **back** from the worker (Job result).
 * - `progress`: Optional progress schema definition (static vs dynamic).
 *
 * @typeParam I - The Rich Input type.
 * @typeParam O - The Rich Output type.
 * @typeParam S - The Progress Schema definition.
 */
export interface Protocol<
	I,
	O,
	P extends ProgressSchema = Record<string, never>
> {
	/** Codec for the input payload. */
	input: Codec<I, unknown>;
	/** Codec for the output payload. */
	output: Codec<O, unknown>;
	/**
	 * Definition of progress stages.
	 * Keys are stage names, values are "static" or "dynamic".
	 */
	progressSchema?: P;
}

/**
 * A wildcard type representing any valid {@link Protocol}.
 *
 * Used for generic constraints to match protocols with arbitrary
 * inputs, outputs, or progress definitions.
 */
export type ValidProtocol<P> = Protocol<
	ProtocolInput<P>,
	ProtocolOutput<P>,
	ProgressSchema
>;

/**
 * Utility to extract the "Rich" Input type from a Protocol definition.
 */
export type ProtocolInput<P> = P extends Protocol<
	infer I,
	unknown,
	ProgressSchema
>
	? I
	: never;

/**
 * Utility to extract the "Rich" Output type from a Protocol definition.
 */
export type ProtocolOutput<P> = P extends Protocol<
	unknown,
	infer O,
	ProgressSchema
>
	? O
	: never;

/**
 * Helper to extract the `TaskProgress` from a Protocol.
 */
export type ProtocolProgress<P> = P extends Protocol<unknown, unknown, infer S>
	? TaskProgress<S>
	: never;

/**
 * Helper to extract the `ProgressSchema` from a Protocol.
 */
export type ProtocolProgressSchema<P> = P extends Protocol<
	unknown,
	unknown,
	infer S
>
	? S
	: never;

/**
 * A helper to define a worker protocol with strict type inference.
 *
 * This function ensures your protocol matches the required structure
 * and correctly infers literal types (especially for the progress schema)
 * without needing manual `as const` assertions.
 *
 * @param config - The protocol configuration.
 */
export function defineProtocol<
	InputCodec extends Codec<unknown, unknown>,
	OutputCodec extends Codec<unknown, unknown>,
	const S extends ProgressSchema = Record<string, never>
>(config: {
	input: InputCodec;
	output: OutputCodec;
	progressSchema?: S;
}): Protocol<Infer<InputCodec>, Infer<OutputCodec>, S> {
	return config as Protocol<Infer<InputCodec>, Infer<OutputCodec>, S>;
}
