import { ENV } from "env";
import React from "react";
import { DbLinkDeleteButton } from "~dblink/DbLinkDeleteButton";
import { DbLinkTool } from "~dblink/DbLinkTool";
import { useTools } from "~ui/annotator/hooks/Tools";
import { Eraser } from "./Eraser";
import { HelpButton } from "./Help";
import { RedoButton, UndoButton } from "./UndoRedo";

export function HeaderSettings() {
	const { selectedTool } = useTools();
	const toolSettings = selectedTool
		? React.createElement(selectedTool.getQuickSettingsComponent(), {
				tool: selectedTool,
		  })
		: null;

	const isDbLinkActive =
		ENV.ANNOTATOR_3D_DBLINK_ENABLED && selectedTool instanceof DbLinkTool;

	return (
		<div className="flex flex-grow items-center">
			<UndoButton></UndoButton>
			<RedoButton></RedoButton>
			<Eraser></Eraser>
			{isDbLinkActive && <DbLinkDeleteButton />}
			{toolSettings}
			<HelpButton></HelpButton>
		</div>
	);
}
