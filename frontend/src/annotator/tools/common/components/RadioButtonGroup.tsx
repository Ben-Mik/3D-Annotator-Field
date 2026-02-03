interface Choice {
	name: string;
	displayName: string;
	description: string;
}

/**
 * This props object contains all props generally used by an tool
 */
interface Props<Choices extends readonly Choice[]> {
	label: string;
	choices: Choices;
	value: Choices[number]["name"];
	onChange: (name: Choices[number]["name"]) => void;
}

/**
 * A reusable component to change a tools settings.
 * Creates a button group, where only one button is selected.
 *
 * @param param0 an object containing all {@link Props} for an tool
 * @returns A RadioButtonGroup component
 */
export function RadioButtonGroup<Choices extends readonly Choice[]>({
	label,
	onChange,
	value,
	choices,
}: Props<Choices>) {
	return (
		<div className="mx-1 my-auto flex gap-2">
			<label className="label">{label}</label>
			<div className="btn-group">
				{choices.map(({ name, displayName, description }, index) => (
					<input
						key={index}
						type="radio"
						name="options"
						data-title={displayName}
						title={description}
						className="btn btn-outline"
						checked={name === value}
						onChange={(e) => {
							if (e.target.checked) {
								onChange(name);
							}
						}}
					/>
				))}
			</div>
		</div>
	);
}
