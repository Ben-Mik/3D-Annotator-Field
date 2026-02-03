import { getValueInBounds } from "~util/Util";

/**
 * This props object contains all props generally used by an tool
 */
export interface NumberInputProps {
	label: string;
	value: number;
	onChange: (n: number) => void;
	min?: number;
	max?: number;
	step?: number;
	tooltip?: string;
}

/**
 * A component to change to tool size in the UI
 *
 * @param param0 an object containing all {@link NumberInputProps} for an tool
 * @returns
 */
export function NumberInput({
	label,
	value,
	onChange,
	step,
	min,
	max,
	tooltip = "",
}: NumberInputProps) {
	const hasTip = tooltip !== "";
	return (
		<div className="my-auto ml-4 flex gap-2">
			<p
				className={
					"my-auto text-lg text-white" +
					(hasTip ? " tooltip tooltip-bottom" : "")
				}
				data-tip={tooltip}
			>
				{label}
			</p>
			<input
				value={value}
				onChange={(e) => {
					onChange(+e.target.value);
				}}
				onBlur={(e) => {
					const value = getValueInBounds(+e.target.value, min, max);
					onChange(value);
				}}
				type="number"
				min={min}
				step={step}
				max={max}
				className="input input-bordered w-24"
			/>
		</div>
	);
}
