import { useI18nContext } from "i18n/i18n-react";
import { Fragment } from "react/jsx-runtime";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { SettingsHeading } from "~ui/annotator/components/settings/SettingView";
import { POINT_CLOUD_BUILDER_SETTINGS } from "./scene/model/builder/PointCloudBuilder";

export function PointCloudAnnotatorSettingsView() {
	const { LL } = useI18nContext();

	return (
		<Fragment>
			<SettingsHeading>{LL.POINT_CLOUD_ANNOTATOR()}</SettingsHeading>
			<ColorSettingView
				setting={POINT_CLOUD_BUILDER_SETTINGS.defaultPointColor}
				name={LL.SETTING_DEFAULT_POINT_CLOUD_COLOR()}
				description={LL.SETTING_DEFAULT_POINT_CLOUD_COLOR_DESC()}
				needsReload
			></ColorSettingView>
		</Fragment>
	);
}
