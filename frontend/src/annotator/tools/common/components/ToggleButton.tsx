/**
 * This props object contains all props generally used by a tool
 */
interface Props {
	label: string;
	onChange: (n: boolean) => void;
	toolTip: string;
	selected: boolean;
}

/**
 * A component to toggle a function of the tool in the UI.
 *
 * @param param0 an object containing all {@link Props} for an tool
 * @returns
 */
export function ToggleButton({ label, onChange, toolTip, selected }: Props) {
	return (
		<div
			className="tooltip tooltip-bottom mx-1 my-auto flex"
			data-tip={toolTip}
		>
			<button
				className={"btn btn-ghost " + (selected ? "btn-active" : "")}
				aria-pressed={selected}
				onClick={(e) => {
					const isSelected = e.currentTarget.ariaPressed === "false";
					e.currentTarget.ariaPressed = "" + isSelected;
					if (isSelected) {
						e.currentTarget.classList.add("btn-active");
					} else {
						e.currentTarget.classList.remove("btn-active");
					}
					onChange(isSelected);
				}}
			>
				{label}
			</button>
		</div>
	);
}
