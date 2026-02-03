import { useI18nContext } from "i18n/i18n-react";
import { Fragment } from "react/jsx-runtime";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { SettingsHeading } from "~ui/annotator/components/settings/SettingView";
import { MESH_BUILDER_SETTINGS } from "./scene/model/builder/MeshBuilder";

export function MeshAnnotatorSettingsView() {
	const { LL } = useI18nContext();

	return (
		<Fragment>
			<SettingsHeading>{LL.MESH_ANNOTATOR()}</SettingsHeading>
			<ColorSettingView
				setting={MESH_BUILDER_SETTINGS.defaultMaterialColor}
				name={LL.SETTING_DEFAULT_MESH_COLOR()}
				description={LL.SETTING_DEFAULT_MESH_COLOR_DESC()}
				needsReload
			></ColorSettingView>
		</Fragment>
	);
}
