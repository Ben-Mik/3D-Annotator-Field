import { NumberInput, type NumberInputProps } from "./NumberInput";

type Props = Omit<NumberInputProps, "step">;

export function PercentInput({ value, onChange, ...props }: Props) {
	return (
		<NumberInput
			{...props}
			value={value}
			onChange={(number) => {
				onChange(number);
			}}
			step={numberToStep(value)}
		/>
	);
}

function numberToStep(n: number | undefined, magnitude = 1) {
	if (n === undefined) {
		return 1;
	}

	return Math.pow(10, Math.ceil(Math.log10(n) - magnitude));
}
