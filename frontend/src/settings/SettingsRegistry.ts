import type { Unsubscribe } from "~events/Events";
import type { NestedRecord } from "~util/TypeScript";
import { isSetting, type Setting } from "./Setting";

/**
 * A registry keeping track of a set of Settings.
 * It persists the values of the settings between sessions
 * and initializes them with the last known value when registered.
 *
 * To persist a Setting between sessions, ```register(setting)``` needs to be
 * called at the beginning of the session (ideally right after creating the
 * setting in global scope).
 */
export interface SettingsRegistry {
	register(setting: Setting<unknown>): void;
	resetAll(): void;
	clear(): void;
}

const LOCAL_STORAGE_KEY = "anno3d-cnfg";

interface MapValue {
	setting: Setting<unknown>;
	unsubscribe: Unsubscribe;
}

const REGISTRIES: LocalStorageSettingsRegistry[] = [];

export class LocalStorageSettingsRegistry implements SettingsRegistry {
	private prefix: string;
	private settings: Map<string, MapValue>;

	/**
	 * Creates a new SettingsRegistry using the browsers local storage.
	 *
	 * Each registered settings needs a unique name!
	 *
	 * @param prefix 	a unique prefix to prevent naming conflicts
	 * 					between different settings registries
	 */
	constructor(prefix: string) {
		this.prefix = prefix;
		this.settings = new Map();
		REGISTRIES.push(this);
	}

	/**
	 * Registers a single setting.
	 * Each setting registered must have a unique name!
	 * @param setting the setting
	 */
	public register(setting: Setting<unknown>) {
		if (this.settings.has(setting.name)) {
			console.warn(
				`A setting with name ${setting.name} already existed and will be overwritten.`
			);
		}

		this.initializeSetting(setting);
		const unsubscribe = setting.on("change", () => {
			this.updateLocalStorageValue(setting);
		});

		this.settings.set(setting.name, { setting, unsubscribe });
	}

	/**
	 * Registers an object of (nested) labeled settings.
	 * Each setting registered must have a unique name!
	 * @param setting the setting
	 */
	public registerMultiple(settings: NestedRecord<Setting<unknown>>) {
		for (const key in settings) {
			const value = settings[key];
			if (isSetting(value)) {
				this.register(value);
			} else {
				this.registerMultiple(value);
			}
		}
	}

	public clear(): void {
		for (const [, { unsubscribe }] of this.settings.entries()) {
			unsubscribe();
		}
		this.settings.clear();
	}

	/**
	 * Clears the local storage values of this registry.
	 */
	public clearLocalStorage(): void {
		for (const key of this.settings.keys()) {
			localStorage.removeItem(this.getLocalStorageKey(key));
		}
	}

	/**
	 * Resets all registered settings.
	 */
	public resetAll(): void {
		for (const { setting } of this.settings.values()) {
			setting.reset();
		}
	}

	private initializeSetting(setting: Setting<unknown>) {
		const localStorageValue = localStorage.getItem(
			this.getLocalStorageKey(setting.name)
		);

		if (localStorageValue) {
			setting.initialize(setting.deserialize(localStorageValue));
		}
	}

	private updateLocalStorageValue(setting: Setting<unknown>): void {
		localStorage.setItem(
			this.getLocalStorageKey(setting.name),
			setting.serialize()
		);
	}

	private getLocalStorageKey(name: string): string {
		return `${LOCAL_STORAGE_KEY}_${this.prefix}_${name}`;
	}

	/**
	 * Clears the local storage values of all registries.
	 */
	public static clearLocalStorage(): void {
		for (const registry of REGISTRIES) {
			registry.clearLocalStorage();
		}
	}

	/**
	 * Resets all registered settings of all registries.
	 */
	public static resetAll(): void {
		for (const registry of REGISTRIES) {
			registry.resetAll();
		}
	}
}
