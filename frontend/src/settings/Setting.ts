import type { Destroyable } from "~entity/Types";
import type { Subscribable, ValueChange } from "~events/Events";

export type SettingEvents<T> = {
	beforeChange: ValueChange<T>;
	change: ValueChange<T>;
};

/**
 * A signal based setting.
 */
export interface Setting<T>
	extends Subscribable<SettingEvents<T>>,
		Destroyable {
	readonly isSetting: true;
	readonly name: string;
	/**
	 * The initial or default value.
	 */
	readonly initialValue: T;

	/**
	 * Returns the current value of this setting.
	 */
	get(): T;

	/**
	 * Initializes this setting with a given value.
	 * The same as ``set(value: T): void`` but without flagging this setting as dirty.
	 */
	initialize(value: T): void;

	/**
	 * Sets the current value of this setting to the given value.
	 * All observers will be notified of the change.
	 */
	set(value: T): void;

	/**
	 * Resets the value of this setting to its initial value.
	 */
	reset(): void;

	/**
	 * Returns true iff this setting's value has been changed by calling ``set(value: T): void``
	 * since this Setting was constructed.
	 */
	isDirty(): boolean;

	/**
	 * Serializes the current value of this setting into a string.
	 */
	serialize(): string;

	/**
	 * Deserializes the given string into a valid value for this setting.
	 *
	 * The given string must be the result of calling ```serialize()``.
	 */
	deserialize(value: string): T;
}

export function isSetting(obj: unknown): obj is Setting<unknown> {
	return (obj as Setting<unknown>).isSetting;
}
