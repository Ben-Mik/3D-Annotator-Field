interface ToolButtonProps {
	imagePath?: string;
	icon?: JSX.Element;
	toolFunc: () => void;
	toolAlt?: string;
	selected?: boolean;
	disabled?: boolean;
}

export function ToolButton({
	imagePath,
	icon,
	toolFunc,
	toolAlt = "",
	selected,
	disabled,
}: ToolButtonProps) {
	return (
		<div className="tooltip tooltip-right h-16 w-16" data-tip={toolAlt}>
			<button
				className={`btn btn-primary m-1 h-14 w-14 px-3 ${
					selected && "btn-info"
				}`}
				onClick={toolFunc}
				disabled={disabled}
			>
				{icon ? (
					icon
				) : (
					<img
						src={imagePath}
						alt={toolAlt}
						className={disabled ? "opacity-25" : ""}
					/>
				)}
			</button>
		</div>
	);
}
