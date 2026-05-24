interface LogSliderProps {
	label: string;
	value: number;
	onChange: (n: number) => void;
	min: number;
	max: number;
}

const SLIDER_STEPS = 1000;

/**
 * A range slider that maps its position logarithmically to a value in
 * [min, max]. Useful when the underlying range spans multiple orders of
 * magnitude (e.g. brush size 0.1 - 300) so small values are not squashed
 * into a narrow strip at the bottom of the slider.
 */
export function LogSlider({
	label,
	value,
	onChange,
	min,
	max,
}: LogSliderProps) {
	const logMin = Math.log10(min);
	const logMax = Math.log10(max);
	const logRange = logMax - logMin;

	const clampedValue = Math.min(Math.max(value, min), max);
	const sliderPos = Math.round(
		((Math.log10(clampedValue) - logMin) / logRange) * SLIDER_STEPS
	);

	return (
		<div className="my-auto ml-4 flex items-center gap-2">
			<p className="my-auto text-lg text-white">{label}</p>
			<input
				type="range"
				min={0}
				max={SLIDER_STEPS}
				step={1}
				value={sliderPos}
				onChange={(e) => {
					const pos = +e.target.value / SLIDER_STEPS;
					const raw = Math.pow(10, pos * logRange + logMin);
					onChange(Math.round(raw * 100) / 100);
				}}
				className="range range-primary range-sm w-40"
			/>
		</div>
	);
}
