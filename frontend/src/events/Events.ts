import type { UnionToIntersection } from "~util/TypeScript";

/**
 * Represents a callback function that receives data from an event.
 *
 * The function signature changes based on whether the optional `M` (MetaData) type is provided.
 *
 * @param T The type of the event payload (the primary value).
 * @param R The return type of the callback. Defaults to `void`.
 * @param M Optional metadata. If provided, the observer receives two arguments: `(value: T, metaData: M)`.
 * If not provided, it receives one: `(value: T)`.
 */
export type Observer<T, R = void, M = undefined> = [M] extends [undefined]
	? (value: T) => R
	: (value: T, metaData: M) => R;

/**
 * A zero-argument function that removes an event subscription when called.
 */
export type Unsubscribe = () => void;

/**
 * Represents an object that captures the change of a value from old to new.
 * Useful as a payload for events that signify a state or value change.
 *
 * @param T The type of the value that changed.
 */
export interface ValueChange<T> {
	/** The value before the change. */
	old: T;
	/** The value after the change. */
	new: T;
}

/**
 * A generic constraint for a type-safe event system.
 * It maps event names (keys) to their corresponding payload types (values).
 *
 * @example
 * ```ts
 * type MyEvents = {
 * 'login': string; // event 'login' has a string payload
 * 'change': ValueChange<MyState>; // event 'change' has a complex payload
 * 'ready': void; // event 'ready' has no payload
 * };
 * ```
 */
export type EventMap = Record<PropertyKey, unknown>;

/**
 * A helper type that resolves the correct `Observer` type for an array of events.
 *
 * It validates that all events in the union `K` share the exact same payload type.
 * If they do not, it resolves to `never`, causing a compile-time error.
 * If they do, it resolves to an `Observer` that receives the shared payload *and*
 * the specific event name (`K`) that triggered the call as its second `metaData` argument.
 *
 * @param Events The `EventMap`.
 * @param K A union of event keys (e.g., "event1" | "event2").
 */
export type SharedEventObserver<
	Events extends EventMap,
	K extends keyof Events
> = Events[K] extends UnionToIntersection<Events[K]>
	? Observer<UnionToIntersection<Events[K]>, void, K>
	: never;

/**
 * Defines a public-facing interface for an object that allows consumers
 * to subscribe to events.
 *
 * @param Events An `EventMap` defining the available events and their payloads.
 */
export interface Subscribable<Events extends EventMap> {
	/**
	 * Subscribes to a single event.
	 *
	 * @param event The name of the event to subscribe to.
	 * @param observer The callback function to execute when the event is emitted.
	 * @returns An `Unsubscribe` function to remove the subscription.
	 */
	on<K extends keyof Events>(
		event: K,
		observer: Observer<Events[K]>
	): Unsubscribe;

	/**
	 * Subscribes to multiple events that share the exact same payload type.
	 *
	 * This overload will cause a type error if the specified events do not all
	 * have identical payload types.
	 *
	 * The observer for this overload receives the event name as its second argument.
	 *
	 * @param events An array of event names (e.g., `["event1", "event2"]`).
	 * @param observer The callback function to execute. Its signature is
	 * `(value: T, eventName: K) => void`, where `T` is the shared payload type.
	 * @returns An `Unsubscribe` function to remove the subscription from all events.
	 */
	on<K extends keyof Events>(
		events: K[],
		observer: SharedEventObserver<Events, K>
	): Unsubscribe;
}
