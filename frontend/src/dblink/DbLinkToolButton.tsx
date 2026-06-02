import { Link } from "lucide-react";
import type { ToolButtonProps } from "~annotator/tools/Tool";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * The button component to select the DB-link tool.
 */
export function DbLinkToolButton({ onClick, selected }: ToolButtonProps) {
	return (
		<ToolButton
			icon={<Link size={48} strokeWidth={1} />}
			toolAlt="DB-link"
			toolFunc={onClick}
			selected={selected}
		/>
	);
}
