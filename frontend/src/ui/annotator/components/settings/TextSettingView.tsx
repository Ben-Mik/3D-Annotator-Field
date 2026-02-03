import { useState } from "react";
import type { StringSetting } from "~settings/Settings";
import { useSetting, useSettingEffect } from "~ui/annotator/hooks/Settings";
import { SettingView, type SettingViewProps } from "./SettingView";

interface TextSettingViewProps<T extends string>
	extends SettingViewProps<StringSetting<T>> {
	validate: (input: string) => input is T;
}

export function TextSettingView<T extends string>({
	setting,
	name,
	description,
	needsReload,
	validate,
}: TextSettingViewProps<T>) {
	const [value, setValue, isDirty] = useSetting(setting);
	const [tmpValue, setTmpValue] = useState(value as string);
	const [valid, setValid] = useState(true);

	useSettingEffect(({ new: updatedValue }) => {
		setTmpValue(updatedValue);
		setValid(true);
	}, setting);

	return (
		<SettingView
			setting={setting}
			name={name}
			description={description}
			needsReload={needsReload}
			value={tmpValue}
			isDirty={isDirty}
			resetAction={(value) => {
				if (value === setting.initialValue) {
					setTmpValue(setting.initialValue);
					setValid(true);
				}
				setting.reset();
			}}
		>
			<input
				type="text"
				className={`input input-bordered w-full max-w-xs ${
					valid ? "" : "input-error"
				}`}
				value={tmpValue}
				onChange={({ target }) => {
					if (validate(target.value)) {
						setValid(true);
						setTmpValue(target.value);
						setValue(target.value);
					} else {
						setValid(false);
						setTmpValue(target.value);
					}
				}}
			/>
		</SettingView>
	);
}
