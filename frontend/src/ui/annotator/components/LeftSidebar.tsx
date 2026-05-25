import React from "react";
import type { Model } from "~annotator/scene/model/Model";
import type { Tool } from "~annotator/tools/Tool";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";
import { useTools } from "~ui/annotator/hooks/Tools";
import { ExportMenuModalButton } from "./ExportMenu";
import { SettingsModalButton } from "./GlobalSettings";
import { SaveButton } from "./SaveButton";
import { ViewLockButton } from "./ViewLockButton";

export function LeftSidebar() {
	const annotator = useAnnotator();
	const { tools, selectedTool } = useTools();

	function selectTool(newTool: Tool<Model>) {
		if (!annotator) return;

		if (newTool === selectedTool) {
			annotator.toolManager.unselectCurrentTool();
			return;
		}

		annotator.toolManager.selectTool(newTool);
	}

	const toolButtons = tools.map((tool, index) =>
		React.createElement(tool.getToolButtonComponent(), {
			onClick: () => {
				selectTool(tool);
			},
			key: index,
			selected: selectedTool === tool,
		})
	);

	return (
		<div className="fixed top-0 flex h-dvh w-16 flex-col bg-neutral pt-16 pb-4">
			<div className="flex grow flex-col">
				{toolButtons}
				<div>
					<ViewLockButton />
				</div>
			</div>
			<div className="bottom-0 flex grow flex-col place-content-end">
				<div>
					<SaveButton></SaveButton>
				</div>
				<div>
					<ExportMenuModalButton></ExportMenuModalButton>
				</div>
				<div>
					<SettingsModalButton></SettingsModalButton>
				</div>
			</div>
		</div>
	);
}
