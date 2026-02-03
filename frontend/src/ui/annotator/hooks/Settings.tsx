import { useEffect, useState } from "react";
import type { ColorSetting } from "settings/Settings";
import type { ValueChange } from "~events/Events";
import type { Setting } from "~settings/Setting";

export function useSetting<T>(setting: Setting<T>) {
	const [settingState, setSettingState] = useState(setting.get());
	const [isDirty, setIsDirty] = useState(setting.isDirty());

	useEffect(() => {
		const unsubscribe = setting.on("change", ({ new: updatedValue }) => {
			setSettingState(updatedValue);
			setIsDirty(setting.isDirty());
		});

		return () => {
			unsubscribe();
		};
	}, []);

	return [
		settingState,
		(value: T) => {
			setting.set(value);
		},
		isDirty,
	] as const;
}

export function useHexColorSetting(setting: ColorSetting) {
	const [settingState, setSettingState] = useState(setting.getAsHexString());
	const [isDirty, setIsDirty] = useState(setting.isDirty());

	useEffect(() => {
		const unsubscribe = setting.on("change", () => {
			setSettingState(setting.getAsHexString());
			setIsDirty(setting.isDirty());
		});

		return () => {
			unsubscribe();
		};
	}, []);

	return [
		settingState,
		(value: string) => {
			setting.setAsHexString(value);
		},
		isDirty,
	] as const;
}

export function useSettingEffect<T>(
	effect: (value: ValueChange<T>) => void,
	setting: Setting<T>
) {
	useEffect(() => {
		const unsubscribe = setting.on("change", (value) => {
			effect(value);
		});
		return () => {
			unsubscribe();
		};
	}, [setting]);
}
