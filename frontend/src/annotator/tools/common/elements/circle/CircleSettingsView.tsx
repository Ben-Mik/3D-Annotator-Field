import { useI18nContext } from "i18n/i18n-react";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { NumberSettingView } from "~ui/annotator/components/settings/NumberSettingView";
import type { CircleSettings } from "./Circle";

interface Props {
	circleSettings: CircleSettings;
}

export function CircleSettingsView({
	circleSettings: {
		color,
		emissiveColor,
		emissiveIntensity,
		segments,
		opacity,
	},
}: Props) {
	const { LL } = useI18nContext();

	return (
		<>
			<NumberSettingView
				name={LL.CIRCLE_OPACITY()}
				description={LL.CIRCLE_OPACITY_DESC()}
				setting={opacity}
			></NumberSettingView>
			<NumberSettingView
				name={LL.CIRCLE_SEGMENTS()}
				description={LL.CIRCLE_SEGMENTS_DESC()}
				setting={segments}
			></NumberSettingView>
			<ColorSettingView
				name={LL.CIRCLE_COLOR()}
				description={LL.CIRCLE_COLOR_DESC()}
				setting={color}
			></ColorSettingView>
			<ColorSettingView
				name={LL.CIRCLE_EMISSIVE_COLOR()}
				description={LL.CIRCLE_EMISSIVE_COLOR_DESC()}
				setting={emissiveColor}
			></ColorSettingView>
			<NumberSettingView
				name={LL.CIRCLE_EMISSIVE_COLOR_INTENSITY()}
				description={LL.CIRCLE_EMISSIVE_COLOR_INTENSITY_DESC()}
				setting={emissiveIntensity}
			></NumberSettingView>
		</>
	);
}
