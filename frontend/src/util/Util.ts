export function progressInPercent({
	loaded,
	total,
}: {
	loaded: number;
	total: number;
}): number {
	return (100 * loaded) / total;
}

/**
 * Returns the underlying ArrayBuffers of all ArrayBuffer
 * views inside of the given string record.
 *
 * @param values a map of possible ArrayBuffer views
 * @returns the underlying ArrayBuffers
 */
export function findArrayBuffers(
	values: Record<string, unknown>
): ArrayBuffer[] {
	const arrayBuffers: ArrayBuffer[] = [];
	for (const key in values) {
		const element = values[key];
		if (
			ArrayBuffer.isView(element) &&
			!(element.buffer instanceof SharedArrayBuffer)
		) {
			arrayBuffers.push(element.buffer);
		}
	}
	return arrayBuffers;
}

/**
 * Converts a number to its hexadecimal string representation
 * with a given padding. The returned string will be at least
 * `padding` characters long.
 *
 * @param n the number
 * @param padding the padding
 * @returns the hexadecimal string representation
 */
export function numberToHexString(n: number, padding = 0): string {
	let hex = n.toString(16);
	while (hex.length < padding) {
		hex = "0" + hex;
	}
	return hex;
}

/**
 * Converts a hex code representation into a number.
 * Valid inputs are strings containing only hex digits
 * and strings starting with `#` or `0x`
 *
 * @param str the hex code representation
 * @returns the number
 */
export function hexCodeToNumber(str: string): number {
	if (str.startsWith("#")) {
		str = str.substring(1);
	}
	return parseInt(str, 16);
}

/**
 * Transforms the user input value to a value in bounds.
 *
 * @param value the user input
 * @param min the min value
 * @param max the max value
 * @returns the value in bounds
 */
export function getValueInBounds(value: number, min?: number, max?: number) {
	let newValue = value;
	if (min && value < min) {
		newValue = min;
	} else if (max && value > max) {
		newValue = max;
	}
	return newValue;
}
