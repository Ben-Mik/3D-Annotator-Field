import type { BooleanSetting } from "~settings/Settings";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { SettingView, type SettingViewProps } from "./SettingView";

export function ToggleSettingView({
	setting,
	name,
	description,
	needsReload,
}: SettingViewProps<BooleanSetting>) {
	const [value, setValue, isDirty] = useSetting(setting);

	return (
		<SettingView
			setting={setting}
			name={name}
			description={description}
			needsReload={needsReload}
			value={value}
			isDirty={isDirty}
		>
			<input
				type="checkbox"
				className="toggle"
				checked={value}
				onChange={({ target }) => {
					setValue(target.checked);
				}}
			/>
		</SettingView>
	);
}
