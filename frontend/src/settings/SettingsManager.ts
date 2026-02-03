import type { Observer, Unsubscribe, ValueChange } from "~events/Events";
import { isSetting, type Setting } from "./Setting";

export interface NestedSettings {
	[key: string]: Setting<unknown> | NestedSettings;
}

/**
 * A helper class to simplify the handling of multiple settings.
 *
 * Allows direct read and write access to the settings with properties
 * and onChange effects on single or multiple settings while handling the
 * unsubscribe functions internally.
 */
export type SettingsManager<Settings extends NestedSettings> =
	SettingsManagerClass<Settings> & {
		[Key in keyof Settings]: Settings[Key] extends Setting<infer U> // a leaf -> unwrap to T
			? U
			: // a branch -> recurse into its own manager
			Settings[Key] extends NestedSettings
			? SettingsManager<Settings[Key]>
			: never;
	};

/**
 * Creates a new SettingsManager.
 *
 * Always use this function to create a SettingsManager, not the internal class.
 *
 * @param settings the settings to manage
 * @returns a new SettingsManager
 */
export function createSettingsManager<S extends NestedSettings>(
	settings: S
): SettingsManager<S> {
	return new SettingsManagerClass(settings) as SettingsManager<S>;
}

/** All the keys at this level which are leaf Settings */
type LeafKeys<Settings extends NestedSettings> = {
	[Key in keyof Settings]: Settings[Key] extends Setting<unknown>
		? Key
		: never;
}[keyof Settings];

type NonLeafKeys<Settings extends NestedSettings> = Exclude<
	keyof Settings,
	LeafKeys<Settings>
>;

/** Get the T inside a Setting<T> or never */
type UnpackedTypeOf<S> = S extends Setting<infer V> ? V : never;

class SettingsManagerClass<Settings extends NestedSettings> {
	private settings: Settings;
	private children = new Map<
		keyof Settings,
		SettingsManagerClass<NestedSettings>
	>();
	private unsubscribes: Unsubscribe[] = [];

	constructor(settings: Settings) {
		this.settings = settings;
		for (const key of Object.keys(settings) as (keyof Settings)[]) {
			const value = settings[key]!;
			if (isSetting(value)) {
				Object.defineProperty(this, key, {
					enumerable: true,
					configurable: true,
					get: () => value.get(),
					set: (v: unknown) => {
						value.set(v);
					},
				});
			} else {
				const child = new SettingsManagerClass(value);
				Object.defineProperty(this, key, {
					enumerable: true,
					configurable: true,
					get: () => child,
				});
				this.children.set(key, child);
			}
		}
	}

	// leaf keys -> return the concrete S[K]
	public get<LeafKey extends LeafKeys<Settings>>(
		key: LeafKey
	): Settings[LeafKey];

	// nested keys -> return a sub‐manager
	public get<NonLeafKey extends NonLeafKeys<Settings>>(
		key: NonLeafKey
	): SettingsManagerClass<Extract<Settings[NonLeafKey], NestedSettings>>;

	public get(key: keyof Settings): unknown {
		const value = this.settings[key];
		if (isSetting(value)) {
			return value;
		} else {
			return this.children.get(key) ?? new SettingsManagerClass(value);
		}
	}

	public onChange<LeafKey extends LeafKeys<Settings>>(
		key: LeafKey,
		observer: Observer<ValueChange<UnpackedTypeOf<Settings[LeafKey]>>>
	): void;

	public onChange<LeafKey extends LeafKeys<Settings>>(
		keys: LeafKey[],
		observer: Observer<
			ValueChange<UnpackedTypeOf<Settings[LeafKey]>>,
			void,
			LeafKey
		>
	): void;

	public onChange<LeafKey extends LeafKeys<Settings>>(
		keyOrKeys: LeafKey | LeafKey[],
		observer:
			| Observer<ValueChange<UnpackedTypeOf<Settings[LeafKey]>>>
			| Observer<
					ValueChange<UnpackedTypeOf<Settings[LeafKey]>>,
					void,
					LeafKey
			  >
	): void {
		if (Array.isArray(keyOrKeys)) {
			for (const key of keyOrKeys) {
				const setting = this.get(key) as Setting<
					UnpackedTypeOf<Settings[LeafKey]>
				>;
				const unsubscribe = setting.on("change", (v) => {
					observer(v, key);
				});
				this.unsubscribes.push(unsubscribe);
			}
		} else {
			const setting = this.get(keyOrKeys) as Setting<
				UnpackedTypeOf<Settings[LeafKey]>
			>;
			const unsubscribe = setting.on(
				"change",
				observer as Observer<
					ValueChange<UnpackedTypeOf<Settings[LeafKey]>>
				>
			);
			this.unsubscribes.push(unsubscribe);
		}
	}

	public onBeforeChange<LeafKey extends LeafKeys<Settings>>(
		key: LeafKey,
		observer: Observer<ValueChange<UnpackedTypeOf<Settings[LeafKey]>>>
	): void;

	public onBeforeChange<LeafKey extends LeafKeys<Settings>>(
		keys: LeafKey[],
		observer: Observer<
			ValueChange<UnpackedTypeOf<Settings[LeafKey]>>,
			void,
			LeafKey
		>
	): void;

	public onBeforeChange<LeafKey extends LeafKeys<Settings>>(
		keyOrKeys: LeafKey | LeafKey[],
		observer:
			| Observer<ValueChange<UnpackedTypeOf<Settings[LeafKey]>>>
			| Observer<
					ValueChange<UnpackedTypeOf<Settings[LeafKey]>>,
					void,
					LeafKey
			  >
	): void {
		if (Array.isArray(keyOrKeys)) {
			for (const key of keyOrKeys) {
				const setting = this.get(key) as Setting<
					UnpackedTypeOf<Settings[LeafKey]>
				>;
				const unsubscribe = setting.on("beforeChange", (v) => {
					observer(v, key);
				});
				this.unsubscribes.push(unsubscribe);
			}
		} else {
			const setting = this.get(keyOrKeys) as Setting<
				UnpackedTypeOf<Settings[LeafKey]>
			>;
			const unsubscribe = setting.on(
				"beforeChange",
				observer as Observer<
					ValueChange<UnpackedTypeOf<Settings[LeafKey]>>
				>
			);
			this.unsubscribes.push(unsubscribe);
		}
	}

	public unsubscribeAll(): void {
		for (const child of this.children.values()) {
			child.unsubscribeAll();
		}

		for (const unsubscribe of this.unsubscribes) {
			unsubscribe();
		}

		this.unsubscribes = [];
	}
}
