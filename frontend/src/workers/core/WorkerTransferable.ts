import type { Codec } from "./Codec";

/**
 * Interface for classes that implement their own thread-boundary marshaling logic.
 *
 * Implementing this interface allows a class to define exactly how it should be
 * serialized for `postMessage`, including which internal buffers should be transferred.
 *
 * @typeParam DTO - The Data Transfer Object shape used on the wire.
 */
export interface WorkerTransferable<DTO> {
	/**
	 * Packs the instance into a transferable DTO.
	 *
	 * @returns An object containing the payload and the list of transferables.
	 */
	pack(): { payload: DTO; transfer: Transferable[] };
}

/**
 * Interface representing the static side of a `WorkerTransferable` class.
 *
 * This contract ensures the class provides the necessary factory method to be
 * used with `createWorkerCodecFromClass()`.
 *
 * @typeParam T - The runtime class type.
 * @typeParam DTO - The Data Transfer Object shape.
 */
export interface WorkerTransferableClass<T, DTO> {
	/**
	 * Unpacks the wire DTO into a new instance.
	 *
	 * @param dto - The raw data received.
	 * @returns A new instance of the class.
	 */
	unpack(dto: DTO): T;
}

/**
 * Creates a `WorkerCodec` for a custom class that implements the `WorkerTransferable` pattern.
 *
 * This delegates the pack/unpack logic to the class's `pack` and `unpack` methods.
 *
 * @param Class - The constructor of the class implementing `WorkerTransferable`.
 * @returns A fully configured WorkerCodec.
 */
export function createCodecFromClass<T extends WorkerTransferable<DTO>, DTO>(
	Class: WorkerTransferableClass<T, DTO>
): Codec<T, DTO> {
	return {
		pack(instance) {
			return instance.pack();
		},
		unpack(dto) {
			return Class.unpack(dto);
		},
	};
}
