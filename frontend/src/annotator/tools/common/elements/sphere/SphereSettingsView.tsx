import { useI18nContext } from "i18n/i18n-react";

import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { NumberSettingView } from "~ui/annotator/components/settings/NumberSettingView";
import type { SphereSettings } from "./Sphere";

interface Props {
	sphereSettings: SphereSettings;
}

export function SphereSettingsView({
	sphereSettings: {
		color,
		emissiveColor,
		emissiveIntensity,
		heightSegments,
		widthSegments,
		opacity,
	},
}: Props) {
	const { LL } = useI18nContext();

	return (
		<>
			<NumberSettingView
				name={LL.SPHERE_OPACITY()}
				description={LL.SPHERE_OPACITY_DESC()}
				setting={opacity}
			></NumberSettingView>
			<NumberSettingView
				name={LL.SPHERE_HEIGHT_SEGMENTS()}
				description={LL.SPHERE_HEIGHT_SEGMENTS_DESC()}
				setting={heightSegments}
			></NumberSettingView>
			<NumberSettingView
				name={LL.SPHERE_WIDTH_SEGMENTS()}
				description={LL.SPHERE_WIDTH_SEGMENTS_DESC()}
				setting={widthSegments}
			></NumberSettingView>
			<ColorSettingView
				name={LL.SPHERE_COLOR()}
				description={LL.SPHERE_COLOR_DESC()}
				setting={color}
			></ColorSettingView>
			<ColorSettingView
				name={LL.SPHERE_EMISSIVE_COLOR()}
				description={LL.SPHERE_EMISSIVE_COLOR_DESC()}
				setting={emissiveColor}
			></ColorSettingView>
			<NumberSettingView
				name={LL.SPHERE_EMISSIVE_COLOR_INTENSITY()}
				description={LL.SPHERE_EMISSIVE_COLOR_INTENSITY_DESC()}
				setting={emissiveIntensity}
			></NumberSettingView>
		</>
	);
}
