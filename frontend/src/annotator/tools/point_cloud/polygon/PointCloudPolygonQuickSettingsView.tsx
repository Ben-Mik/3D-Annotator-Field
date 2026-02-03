import { useI18nContext } from "i18n/i18n-react";
import { useEffect, useState } from "react";
import { type ToolQuickSettingsProps } from "~annotator/tools/Tool";
import { Button } from "~annotator/tools/common/components/Button";
import {
	MIN_POINTS,
	type PointCloudPolygon,
	PolygonToolState,
} from "./PointCloudPolygon";

/**
 * The button component to access the quick setting of the PolygonTool
 */
export function PointCloudPolygonQuickSettingsView(
	props: ToolQuickSettingsProps
) {
	const tool = props.tool as PointCloudPolygon;
	const [state, setState] = useState(tool.getState());
	const [count, setCount] = useState(tool.getNumberOfPoints());

	useEffect(() => {
		const unsubscribeState = tool.on("stateChange", (state) => {
			setState(state);
		});

		const unsubscribeCount = tool.on("pointCountChange", (count) => {
			setCount(count);
		});

		return () => {
			unsubscribeState();
			unsubscribeCount();
		};
	}, [tool]);

	const { LL } = useI18nContext();

	return (
		<div className="flex">
			<Button
				disabled={state === PolygonToolState.INACTIVE}
				onClick={() => {
					tool.removeLastPoint();
				}}
				toolTip={"d / " + LL.DELETE_KEY()}
			>
				{LL.REMOVE_CORNER()}
			</Button>
			<Button
				disabled={
					state !== PolygonToolState.ACTIVE || count < MIN_POINTS
				}
				onClick={() => {
					tool.concludePolygon();
				}}
				toolTip={"a / " + LL.ENTER_KEY()}
			>
				{LL.CLOSE()}
			</Button>
			<Button
				disabled={state !== PolygonToolState.SELECTED}
				onClick={() => {
					tool.annotate();
				}}
				toolTip={"a / " + LL.ENTER_KEY()}
			>
				{LL.ANNOTATE()}
			</Button>
			<Button
				disabled={state === PolygonToolState.INACTIVE}
				onClick={() => {
					tool.abort();
				}}
				toolTip={LL.ESCAPE_KEY()}
			>
				{LL.CANCEL()}
			</Button>
		</div>
	);
}
