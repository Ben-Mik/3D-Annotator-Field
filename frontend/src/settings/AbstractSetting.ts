import { EventManager } from "~events/EventManager";
import type { ValueChange } from "~events/Events";
import type { Setting, SettingEvents } from "./Setting";

export abstract class AbstractSetting<T> implements Setting<T> {
	private readonly eventManager = new EventManager<SettingEvents<T>>();
	public on = this.eventManager.on.bind(this.eventManager);

	public readonly isSetting = true;
	public readonly name: string;
	public readonly initialValue: T;

	protected value: T;
	private dirty: boolean;

	constructor(name: string, initial: T) {
		this.name = name;
		this.initialValue = initial;
		this.value = initial;
		this.dirty = false;
	}

	public get(): T {
		return this.value;
	}

	public initialize(value: T): void {
		this.setValue(value);
	}

	public set(value: T): void {
		this.dirty = true;
		this.setValue(value);
	}

	/**
	 * Internal helper to set a given value as the current value
	 * of this setting and notifying all observers.
	 * @param value the given value
	 */
	private setValue(value: T): void {
		this.validate(value);
		const changeObject: ValueChange<T> = {
			old: this.value,
			new: value,
		};
		this.eventManager.emit("beforeChange", changeObject);
		this.value = value;
		this.eventManager.emit("change", changeObject);
	}

	/**
	 * Called by ``set(value: T): void`` and ``initialize(value: T): void``
	 * with the given value.
	 * If the value should be rejected, this function needs to throw an error.
	 * The default implementation does nothing, i.e. all values are allowed.
	 *
	 * The initial value is not checked and should be checked in the
	 * constructor of the child class!
	 *
	 * @param _value the given value
	 * @returns nothing (throws an error) if the value should be rejected
	 */
	protected validate(value: T): void | never {
		value;
	}

	public reset(): void {
		this.set(this.initialValue);
	}

	public isDirty(): boolean {
		return this.dirty;
	}

	public serialize(): string {
		return JSON.stringify(this.value);
	}

	public deserialize(value: string): T {
		return JSON.parse(value) as T;
	}

	public destroy(): void {
		this.eventManager.destroy();
	}
}
