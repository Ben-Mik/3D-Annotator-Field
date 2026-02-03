import { useI18nContext } from "i18n/i18n-react";
import type { PercentageSetting } from "~settings/Settings";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { PercentInput } from "../../components/PercentInput";

/**
 * An object to store general props for a sphere
 */
interface Props {
	sizeSetting: PercentageSetting;
}

export function SphereQuickSettingsView({ sizeSetting }: Props) {
	const { LL } = useI18nContext();
	const [size, setSize] = useSetting(sizeSetting);
	return (
		<PercentInput
			label={LL.SIZE() + ":"}
			value={size}
			onChange={(size) => {
				setSize(size);
			}}
			min={sizeSetting.min}
			max={sizeSetting.max}
		/>
	);
}
