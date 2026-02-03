import { useI18nContext } from "i18n/i18n-react";
import { ColorSetting } from "~settings/Settings";
import { useHexColorSetting } from "~ui/annotator/hooks/Settings";
import {
	DefaultValue,
	SettingView,
	type SettingViewProps,
} from "./SettingView";

export function ColorSettingView({
	setting,
	name,
	description,
	needsReload,
}: SettingViewProps<ColorSetting>) {
	const { LL } = useI18nContext();
	const [hexValue, setHexValue, isDirty] = useHexColorSetting(setting);

	return (
		<SettingView
			setting={setting}
			name={name}
			description={description}
			needsReload={needsReload}
			value={hexValue}
			isDirty={isDirty}
			defaultValueNode={
				<DefaultValue
					value={hexValue}
					setting={setting}
					isDefault={(value) =>
						value === ColorSetting.toHexString(setting.initialValue)
					}
				>
					<span>({LL.SETTING_DEFAULT()}: </span>
					<span className="font-mono not-italic">
						{"" +
							ColorSetting.toHexString(
								setting.initialValue
							).toUpperCase()}
						<span
							className={`ml-1 inline-block h-4 w-4 rounded-full align-text-bottom`}
							style={{
								backgroundColor: ColorSetting.toHexString(
									setting.initialValue
								),
							}}
						></span>
						)
					</span>
				</DefaultValue>
			}
		>
			<input
				type="color"
				className="input input-bordered w-14 p-1"
				value={hexValue}
				onChange={({ target }) => {
					setHexValue(target.value);
				}}
				min={setting.min}
				max={setting.max}
			/>
		</SettingView>
	);
}
