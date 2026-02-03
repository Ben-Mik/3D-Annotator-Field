import type { StringSetting } from "~settings/Settings";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { SettingView, type SettingViewProps } from "./SettingView";

interface SelectSettingViewProps<T extends string>
	extends SettingViewProps<StringSetting<T>> {
	options: T[];
}

export function SelectSettingView<T extends string>({
	setting,
	name,
	description,
	needsReload,
	options,
}: SelectSettingViewProps<T>) {
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
			<select
				className="select select-bordered select-sm mt-4 w-full max-w-xs"
				value={value}
				onChange={({ currentTarget }) => {
					setValue(currentTarget.value as T);
				}}
			>
				{options.map((option, i) => (
					<option value={option} key={option}>
						test {i}
					</option>
				))}
			</select>
		</SettingView>
	);
}
