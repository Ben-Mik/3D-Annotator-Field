import { useI18nContext } from "i18n/i18n-react";
import { Info } from "lucide-react";
import { type PropsWithChildren } from "react";
import type { Setting } from "~settings/Setting";

export interface SettingViewProps<T extends Setting<unknown>> {
	setting: T;
	name: string;
	description: string;
	needsReload?: boolean;
}

export function SettingView<T, S extends Setting<T>, V>({
	children,
	name,
	description,
	setting,
	value,
	needsReload,
	isDirty,
	defaultValueNode,
}: PropsWithChildren<
	SettingViewProps<S> &
		DefaultValueProps<T, V> &
		ReloadNoteProps &
		ReloadInfoProps & {
			defaultValueNode?: React.ReactNode;
		}
>) {
	return (
		<div className="flex w-full items-center gap-8">
			<div className="flex-grow">
				<SettingsSubSubHeading>
					{name}

					{defaultValueNode ? (
						defaultValueNode
					) : (
						<DefaultValue
							setting={setting}
							value={value}
						></DefaultValue>
					)}

					<ReloadInfo
						needsReload={needsReload}
						isDirty={isDirty}
					></ReloadInfo>
				</SettingsSubSubHeading>

				<ReloadNote needsReload={needsReload}></ReloadNote>

				<SettingsDescription
					description={description}
				></SettingsDescription>
			</div>

			{children}
		</div>
	);
}

export function SettingsDescription({ description }: { description: string }) {
	return <p className="mt-1 text-sm">{description}</p>;
}

export function SettingsHeading({ children }: PropsWithChildren) {
	return (
		<div className="divider">
			<h2 className="text-xl font-bold text-accent-content">
				{children}
			</h2>
		</div>
	);
}

export function SettingsSubHeading({ children }: PropsWithChildren) {
	return (
		<h3 className="text-lg font-bold text-accent-content">{children}</h3>
	);
}

export function ToolHeading({
	toolName,
	annotationMode,
}: {
	toolName: string;
	annotationMode: string;
}) {
	return (
		<SettingsSubHeading>
			<span>{toolName} </span>
			<span className="font-normal italic">- {annotationMode}</span>
		</SettingsSubHeading>
	);
}

export function SettingsSubSubHeading({ children }: PropsWithChildren) {
	return <h4 className="font-bold">{children}</h4>;
}

export interface DefaultValueProps<S, T> {
	setting: Setting<S>;
	value: T;
	isDefault?: (value: T) => boolean;
	resetAction?: (value: T) => void;
}

export function DefaultValue<S, T>({
	children,
	setting,
	value,
	isDefault,
	resetAction,
}: PropsWithChildren<DefaultValueProps<S, T>>) {
	const { LL } = useI18nContext();
	const isDefaultFunc =
		isDefault ??
		((value) => value === (setting.initialValue as unknown as T));

	return (
		<span
			data-tip={LL.SETTING_RESET()}
			className={`ml-2 select-none text-sm font-normal text-base-content ${
				isDefaultFunc(value)
					? "cursor-auto"
					: "tooltip-top tooltip cursor-pointer"
			}
						`}
			onDoubleClick={() => {
				if (resetAction) {
					resetAction(value);
				} else {
					setting.reset();
				}
			}}
		>
			{children ? (
				children
			) : (
				<>
					<span>({LL.SETTING_DEFAULT()}: </span>
					<span className="font-mono not-italic">
						{"" + setting.initialValue})
					</span>
				</>
			)}
		</span>
	);
}

export interface ReloadNoteProps {
	needsReload?: boolean;
}

export function ReloadNote({ needsReload }: ReloadNoteProps) {
	const { LL } = useI18nContext();
	if (needsReload) {
		return <p className="text-sm italic">{LL.SETTING_RELOAD_NOTICE()}</p>;
	}
	return null;
}

export interface ReloadInfoProps {
	needsReload?: boolean;
	isDirty: boolean;
}

export function ReloadInfo({ needsReload, isDirty }: ReloadInfoProps) {
	const { LL } = useI18nContext();
	if (needsReload && isDirty) {
		return (
			<span
				data-tip={LL.SETTING_RELOAD_CHANGED()}
				className="tooltip tooltip-right ml-2 select-none text-sm font-normal text-base-content"
			>
				<Info className="inline-block h-4 w-4 align-text-bottom text-warning"></Info>
			</span>
		);
	}
	return null;
}
