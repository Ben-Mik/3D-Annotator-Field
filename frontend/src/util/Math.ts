export function clamp(n: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, n));
}

export function average(numbers: ArrayLike<number>): number {
	let sum = 0;
	for (let i = 0; i < numbers.length; i++) {
		sum += numbers[i];
	}
	return sum / numbers.length;
}

/**
 * Faster alternative to {@link Math.round()} for positive numbers.
 *
 * @param number the positive number
 * @returns the given positive number rounded to the next integer
 */
export function fastRound(number: number): number {
	return (number + 0.5) | 0;
}

/**
 * Calculates the number of decimal digits in the integer part of a number.
 *
 * This method is highly optimized. It uses a fast, branch-based lookup
 * for all numbers with 16 or fewer integer digits (the common case)
 * and falls back to a logarithmic calculation for very large numbers.
 *
 * It correctly handles all finite numbers (positive, negative, zero,
 * and floats).
 *
 * @param n The number to measure.
 * @returns The number of digits in the integer part.
 *
 * @example
 * countIntegerDigits(12345)     // => 5
 * countIntegerDigits(-987)      // => 3
 * countIntegerDigits(0)         // => 1
 * countIntegerDigits(42.195)    // => 2
 * countIntegerDigits(Number.MAX_SAFE_INTEGER) // => 16
 * countIntegerDigits(1e20)      // => 21
 */
export function countIntegerDigits(n: number): number {
	const v = Math.floor(Math.abs(n));

	// fast path for common numbers (from 0 up to 16 digits)
	if (v < 10) return 1;
	if (v < 100) return 2;
	if (v < 1000) return 3;
	if (v < 10000) return 4;
	if (v < 100000) return 5;
	if (v < 1000000) return 6;
	if (v < 10000000) return 7;
	if (v < 100000000) return 8;
	if (v < 1000000000) return 9;
	if (v < 10000000000) return 10;
	if (v < 100000000000) return 11;
	if (v < 1000000000000) return 12;
	if (v < 10000000000000) return 13;
	if (v < 100000000000000) return 14;
	if (v < 1000000000000000) return 15;
	if (v < 10000000000000000) return 16;

	// slower fallback for very large numbers (>= 10^16)
	return Math.floor(Math.log10(v)) + 1;
}
