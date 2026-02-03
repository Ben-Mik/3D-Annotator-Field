/**
 * Writes the UTF-8 byte representation of an integer (positive or negative)
 * directly into a `Uint8Array` without intermediate string allocation.
 *
 * This method exists as a high-performance alternative to the
 * `textEncoder.encodeInto(n.toString(), u8view.subarray(offset))` pattern.
 * It avoids all allocations (no new strings, no new subarray views) and
 * therefore is suitable for hot serialization loops.
 *
 * @param n The number to write.
 * @param array The buffer view to write into.
 * @param offset The offset to start writing at. **Defaults to 0.**
 * @returns The number of bytes (digits + sign) written.
 */
export function utf8EncodeIntegerInPlace(
	n: number,
	array: Uint8Array,
	offset = 0
): number {
	if (n === 0) {
		array[offset] = 48; // ASCII '0'
		return 1;
	}

	let signBytes = 0;

	if (n < 0) {
		array[offset] = 45; // ASCII '-'
		offset++;
		n = -n; // Continue with the absolute value
		signBytes = 1;
	}

	// --- integer to string ---
	// This writes the digits backwards, then reverses them in-place.

	const startOfDigits = offset;
	let end = offset;
	let num = n;

	while (num > 0) {
		array[end++] = (num % 10) + 48;
		num = Math.floor(num / 10);
	}

	const digitCount = end - startOfDigits;
	end--; // point to the last written digit

	let start = startOfDigits;
	while (start < end) {
		const tmp = array[start];
		array[start] = array[end];
		array[end] = tmp;
		start++;
		end--;
	}

	return digitCount + signBytes;
}
