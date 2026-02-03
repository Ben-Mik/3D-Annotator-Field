import { Color } from "~entity/Color";
import { hexCodeToNumber, numberToHexString } from "~util/Util";
import { AbstractSetting } from "./AbstractSetting";

export class BooleanSetting extends AbstractSetting<boolean> {}

export class StringSetting<
	T extends string = string
> extends AbstractSetting<T> {}

export class NumberSetting extends AbstractSetting<number> {
	public readonly min: number;
	public readonly max: number;

	/**
	 * Creates a new NumberSetting.
	 *
	 * @param name settings name
	 * @param options initial value and optional min and max values
	 */
	constructor(
		name: string,
		options: {
			initial: number;
			min?: number;
			max?: number;
		}
	) {
		super(name, options.initial);
		this.min = options.min ?? -Infinity;
		this.max = options.max ?? Infinity;
		this.checkMinMax(this.value);
	}

	protected override validate(value: number): void {
		this.checkMinMax(value);
	}

	protected checkMinMax(value: number) {
		if (value < this.min || value > this.max) {
			throw new Error(
				`NumberSetting '${this.name}: '${value}' is out of bounds (min: ${this.min}, max: ${this.max})`
			);
		}
	}
}

export class PercentageSetting extends NumberSetting {
	constructor(name: string, initial: number, max = 100) {
		super(name, {
			initial: initial,
			min: 0,
			max,
		});
	}

	protected override checkMinMax(value: number): void {
		if (value < this.min || value > this.max) {
			throw new Error(
				`PercentageSetting '${this.name}: '${this.value}' is out of bounds (min: ${this.min}, max: ${this.max})`
			);
		}
	}

	public setAsNumber(value: number): void {
		this.set(value * 100);
	}

	public getAsNumber(): number {
		return PercentageSetting.toNumber(this.value);
	}

	public static toNumber(value: number) {
		return value / 100;
	}
}

const MAX_COLOR_VALUE = Math.pow(16, 6) - 1;
export class ColorSetting extends NumberSetting {
	constructor(name: string, initial: number) {
		super(name, {
			initial: initial,
			min: 0,
			max: MAX_COLOR_VALUE,
		});
	}

	protected override checkMinMax(value: number): void {
		if (value < this.min || value > this.max) {
			const str = numberToHexString(value, 6);
			throw new Error(
				`ColorSetting '${this.name}: '#${str}' is not a valid color (min: ${this.min}, max: ${this.max})`
			);
		}
	}

	public setAsHexString(value: string): void {
		const newValue = hexCodeToNumber(value);
		this.set(newValue);
	}

	public getAsHexString(): string {
		return ColorSetting.toHexString(this.value);
	}

	public getAsColor(): Color {
		return ColorSetting.toColor(this.value);
	}

	public static toHexString(value: number): string {
		return `#${numberToHexString(value, 6)}`;
	}

	public static toColor(value: number): Color {
		return Color.fromNumber(value);
	}
}
