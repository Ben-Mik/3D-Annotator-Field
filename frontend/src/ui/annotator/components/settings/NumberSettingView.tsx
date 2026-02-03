import type { NumberSetting } from "~settings/Settings";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { getValueInBounds } from "~util/Util";
import { SettingView, type SettingViewProps } from "./SettingView";

export function NumberSettingView({
	setting,
	name,
	description,
	needsReload,
}: SettingViewProps<NumberSetting>) {
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
				type="number"
				className="input input-bordered min-w-28"
				value={value}
				onChange={(e) => {
					setValue(+e.target.value);
				}}
				onBlur={(e) => {
					const newValue = getValueInBounds(
						+e.target.value,
						setting.min,
						setting.max
					);
					setValue(newValue);
				}}
				min={setting.min}
				max={setting.max}
			/>
		</SettingView>
	);
}
