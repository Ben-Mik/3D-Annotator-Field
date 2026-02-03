import { createErrorGuard } from "../Error";
import { humanReadableDataSize } from "./FileUtils";

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

/**
 * Returns the root {@link FileSystemDirectoryHandle} for the Origin Private File System.
 *
 * The underlying request is memoized; subsequent calls return the same promise.
 *
 * @returns A promise resolving to the OPFS root directory handle.
 */
export function getOpfsRoot() {
	if (!rootPromise) {
		rootPromise = navigator.storage.getDirectory();
	}
	return rootPromise;
}

/**
 * Convenience options object for APIs that accept `{ create: boolean }`.
 *
 * Can be passed directly to OPFS methods like `getFileHandle` or `getDirectoryHandle`.
 */
export const CREATE = {
	create: true,
};

/**
 * Type guard for `DOMException` with `name === "NotFoundError"`.
 *
 * Useful for detecting missing files or directories in OPFS calls.
 */
export const isNotFoundError = createErrorGuard(DOMException, "NotFoundError");

/**
 * Type guard for `DOMException` with `name === "TypeMismatchError"`.
 *
 * Indicates that a path refers to a different kind of entry than expected
 * (for example, file vs directory).
 */
export const isTypeMismatchError = createErrorGuard(
	DOMException,
	"TypeMismatchError"
);

/**
 * Type guard for `DOMException` with `name === "QuotaExceededError"`.
 *
 * Used to detect situations where the storage quota has been exceeded.
 */
export const isQuotaExceededError = createErrorGuard(
	DOMException,
	"QuotaExceededError"
);

/**
 * Retrieves an estimate of current OPFS usage and quota.
 *
 * This wraps {@link navigator.storage.estimate} and normalizes the result
 * so that `usage` and `quota` are always defined. If the browser returns
 * an incomplete estimate, both values default to `0` and a warning is logged.
 *
 * @returns A promise resolving to an object with `usage` and `quota` in bytes.
 */
export async function getOpfsUsageEstimate(): Promise<
	Required<StorageEstimate>
> {
	const estimate = await navigator.storage.estimate();

	if (!isValidEstimate(estimate)) {
		console.warn(
			"[OPFS Util] navigator.storage returned an estimate with undefined values."
		);
		return {
			usage: 0,
			quota: 0,
		};
	}

	return estimate;
}

/**
 * Checks whether the given storage estimate has both `usage` and `quota` defined.
 *
 * Acts as a type guard to narrow `StorageEstimate` to a version where both
 * fields are present.
 *
 * @param estimate - The estimate returned from `navigator.storage.estimate()`.
 * @returns `true` if both `usage` and `quota` are defined.
 */
function isValidEstimate(
	estimate: StorageEstimate
): estimate is Required<StorageEstimate> {
	return estimate.usage !== undefined && estimate.quota !== undefined;
}

/**
 * Deletes all entries in the OPFS root directory.
 *
 * This is a destructive helper intended for debugging or development tooling.
 * It logs the state of the file tree before deletion and a summary of deleted
 * entries to the console.
 *
 * @returns A promise that resolves once all entries have been removed and logged.
 */
export async function resetOpfs() {
	const root = await getOpfsRoot();
	const tree = await getOpfsOverview();
	const deleteMessages: string[] = [];

	for await (const entry of root.values()) {
		if (entry.kind === "directory") {
			deleteMessages.push(`deleting directory '${entry.name}'`);
		} else if (entry.kind === "file") {
			deleteMessages.push(`deleting file '${entry.name}'`);
		}
		await root.removeEntry(entry.name, { recursive: true });
	}

	console.group("Resetting origin private file system...");
	console.groupCollapsed("Before state");
	console.log(tree ? tree : "no entries");
	console.groupEnd();
	console.log(deleteMessages.join("\n"));
	console.groupEnd();
}

/**
 * Produces a human-readable overview of the Origin Private File System (OPFS)
 * in a Unix-style tree format.
 *
 * The output includes:
 * - a hierarchical directory listing using ASCII tree connectors,
 * - human-readable file sizes,
 * - a total size summary at the end.
 *
 * This function walks the entire OPFS tree and may be slow for very large
 * directories. It is intended strictly for diagnostics and debugging.
 *
 * @returns A promise resolving to a tree-formatted string representing the OPFS contents.
 */
export async function getOpfsOverview(): Promise<string> {
	const root = await getOpfsRoot();
	const fileSizes: number[] = [];

	const lines: string[] = ["/"];
	const children = await overviewRec(root, "", fileSizes);
	lines.push(...children);

	const total = fileSizes.reduce((acc, value) => acc + value, 0);
	return lines.join("\n") + `\n\nTotal size: ${humanReadableDataSize(total)}`;
}

/**
 * Recursively builds a Unix-style ASCII tree representation for a directory.
 *
 * This helper is responsible for:
 * - enumerating directory children,
 * - sorting directories and files alphabetically,
 * - drawing ASCII connectors (`├──`, `└──`, `│`),
 * - accumulating file sizes for the final summary.
 *
 * Directories are emitted with a trailing slash. File entries are annotated
 * with human-readable sizes (e.g. `"1.23 MiB"`).
 *
 * @param dir - The directory handle to enumerate.
 * @param prefix - The ASCII prefix used to indent nested entries.
 * @param fileSizes - Collector array for all encountered file sizes.
 * @returns A promise resolving to an array of formatted tree lines.
 */
async function overviewRec(
	dir: FileSystemDirectoryHandle,
	prefix: string,
	fileSizes: number[]
): Promise<string[]> {
	const lines: string[] = [];

	const dirs: FileSystemDirectoryHandle[] = [];
	const files: FileSystemFileHandle[] = [];

	for await (const entry of dir.values()) {
		if (entry.kind === "directory") {
			dirs.push(entry);
		} else if (entry.kind === "file") {
			files.push(entry);
		}
	}

	dirs.sort((a, b) => a.name.localeCompare(b.name));
	files.sort((a, b) => a.name.localeCompare(b.name));

	type Child =
		| { kind: "directory"; handle: FileSystemDirectoryHandle }
		| { kind: "file"; handle: FileSystemFileHandle };

	const children: Child[] = [
		...dirs.map((handle) => ({ kind: "directory" as const, handle })),
		...files.map((handle) => ({ kind: "file" as const, handle })),
	];

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const isLast = i === children.length - 1;

		const connector = isLast ? "└── " : "├── ";
		const nextPrefix = prefix + (isLast ? "    " : "│   ");

		if (child.kind === "file") {
			const file = await child.handle.getFile();
			fileSizes.push(file.size);

			lines.push(
				`${prefix}${connector}${
					child.handle.name
				} (${humanReadableDataSize(file.size)})`
			);
		} else {
			lines.push(`${prefix}${connector}${child.handle.name}/`);

			const nested = await overviewRec(
				child.handle,
				nextPrefix,
				fileSizes
			);
			lines.push(...nested);
		}
	}

	return lines;
}
