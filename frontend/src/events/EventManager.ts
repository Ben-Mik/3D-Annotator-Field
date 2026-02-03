import type { Destroyable } from "~entity/Types";
import type {
	EventMap,
	Observer,
	SharedEventObserver,
	Subscribable,
	Unsubscribe,
} from "~events/Events";

/**
 * Manages event subscriptions and dispatches events.
 *
 * This class is the concrete implementation of the `Subscribable` interface
 * and also provides the `emit` method for dispatching events. It is
 * responsible for storing observers and notifying them when an event occurs.
 *
 * @param Events An `EventMap` defining the available events and their payloads.
 */
export class EventManager<Events extends EventMap>
	implements Subscribable<Events>, Destroyable
{
	private readonly _observers = new Map<
		keyof Events,
		Set<Observer<unknown, void, keyof Events>>
	>();

	/**
	 * Subscribes to a single event.
	 *
	 * The observer will be called with two arguments: the payload and the event name.
	 *
	 * @param event The name of the event to subscribe to.
	 * @param observer The callback function to execute when the event is emitted.
	 * @returns An `Unsubscribe` function to remove the subscription.
	 */
	public on<K extends keyof Events>(
		event: K,
		// This is the public-facing signature for a single event
		observer: Observer<Events[K], void, K>
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
	public on<K extends keyof Events>(
		events: K[],
		observer: SharedEventObserver<Events, K>
	): Unsubscribe;

	public on<K extends keyof Events>(
		eventOrEvents: K | K[],
		observer: Observer<Events[K], void, K> | SharedEventObserver<Events, K>
	): Unsubscribe {
		const events = Array.isArray(eventOrEvents)
			? eventOrEvents
			: [eventOrEvents];

		const unsubscribeFunctions: Unsubscribe[] = [];

		const typedObserver = observer as Observer<unknown, void, keyof Events>;

		for (const event of events) {
			let eventObservers = this._observers.get(event);
			if (!eventObservers) {
				eventObservers = new Set();
				this._observers.set(event, eventObservers);
			}

			eventObservers.add(typedObserver);

			unsubscribeFunctions.push(() => {
				eventObservers.delete(typedObserver);
				if (eventObservers.size === 0) {
					this._observers.delete(event);
				}
			});
		}

		return () => {
			for (const unsubscribe of unsubscribeFunctions) {
				unsubscribe();
			}
		};
	}

	/**
	 * Emits an event, notifying all subscribed observers.
	 *
	 * @param event The name of the event to emit.
	 * @param data The data payload to send to observers. For `void` events,
	 * this must be `undefined`.
	 */
	public emit<Key extends keyof Events>(event: Key, data: Events[Key]): void {
		const eventObservers = this._observers.get(event);

		if (eventObservers) {
			for (const observer of eventObservers.values()) {
				observer(data, event);
			}
		}
	}

	/**
	 * Clears all registered observers from all events.
	 */
	public destroy(): void {
		this._observers.clear();
	}
}
