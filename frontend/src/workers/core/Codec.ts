/**
 * Defines a component capable of transforming data for transmission across threads.
 *
 * A `WorkerCodec` handles the bidirectional conversion between a "Rich" runtime object
 * (which may contain methods, circular references, or context-dependent state) and
 * a "Wire" format suitable for the Structured Clone Algorithm used by `postMessage`.
 *
 * @typeParam Rich - The high-level runtime type.
 * @typeParam Wire - The low-level transfer format (must be Structured Clone compatible).
 */
export interface Codec<Rich, Wire> {
	/**
	 * Prepares the object for transmission to another thread.
	 *
	 * This method creates the wire data structure (payload) and the ownership
	 * transfer list (transferables).
	 *
	 * @param input - The rich object to serialize.
	 * @returns An object containing:
	 * - `payload`: The data to be cloned.
	 * - `transfer`: A list of unique `Transferable` objects (e.g., ArrayBuffer) whose
	 *   ownership will be moved to the receiving thread.
	 */
	pack(input: Rich): { payload: Wire; transfer: Transferable[] };

	/**
	 * Reconstructs the rich object from the wire format.
	 *
	 * @param wire - The raw data received from the other thread.
	 * @returns The fully instantiated rich object.
	 */
	unpack(wire: Wire): Rich;
}
