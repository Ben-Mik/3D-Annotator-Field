import type { Resource } from "./Resource";
import type { Scope } from "./Scope";

const SEPARATOR = "/";
const ROOT_DIRECTORY_NAME = "annotator-file-cache";

/**
 * Represents a logical file path within the cache storage system.
 * Handles directory hierarchy, file naming, and path validation.
 *
 * **Path Name Restrictions**
 *
 * All directory names and file names used to construct a {@link Path} must
 * consist only of the characters:
 *
 * **`A–Z a–z 0–9 _ - .`**
 *
 * (matching the regex: `/^[a-zA-Z0-9_.-]+$/`)
 *
 * Additional rules:
 * - Names must be non-empty and at most 255 characters long.
 * - `"."` and `".."` are not permitted.
 *
 * These restrictions apply to **all** methods that create paths
 * (e.g. {@link Path.fromResource}, {@link Path.fromNames}, {@link Path.fromString}).
 * Any violation will cause a `Path` constructor error.
 *
 * If arbitrary or user-provided identifiers must be used, callers must sanitize
 * or encode them before passing them to `Path`.
 */
export class Path {
	/**
	 * The sequence of directory names leading to the file.
	 */
	public readonly directoryNames: string[];

	/**
	 * The specific file name (including extension).
	 */
	public readonly fileName: string;

	private constructor(directoryNames: string[], fileName: string) {
		this.directoryNames = directoryNames;
		this.fileName = fileName;
		this._validateNames();
	}

	private _validateNames() {
		for (const directoryName of this.directoryNames) {
			if (!this._isValidName(directoryName)) {
				throw new Error(`Invalid directory name: '${directoryName}'`);
			}
		}

		if (!this._isValidName(this.fileName)) {
			throw new Error(`Invalid file name: '${this.fileName}'`);
		}
	}

	private _isValidName(name: string) {
		if (!name || name.length > 255) return false;

		if (name === "." || name === "..") return false;

		return /^[a-zA-Z0-9_\-.]+$/.test(name);
	}

	/**
	 * Converts the path into a generic string representation using forward slashes.
	 * Paths with the same directory names and file name always produce the same
	 * string; paths that differ in any component produce a different string.
	 */
	public toString(): string {
		return [...this.directoryNames, this.fileName].join(SEPARATOR);
	}

	/**
	 * Creates a Path instance from a string representation.
	 *
	 * @param s - The string path (usually created by `toString()`).
	 * @throws {Error} If the derived directory or file name violates path name restrictions.
	 */
	public static fromString(s: string): Path {
		const parts = s.split(SEPARATOR);

		const fileName = parts[parts.length - 1];

		parts.pop();

		return new Path(parts, fileName);
	}

	/**
	 * Construct a logical path from a resource descriptor and its effective scope.
	 *
	 * @param resource - Resource descriptor.
	 * @param effectiveScope - Effective scope for this resource.
	 * @returns the path for the given resource and effective scope.
	 * @throws {Error} If the derived directory or file name violates path name restrictions.
	 */
	public static fromResource(
		resource: Resource<Scope>,
		effectiveScope: Scope
	): Path {
		const parts = [ROOT_DIRECTORY_NAME];

		if ("userId" in effectiveScope) {
			parts.push("users", effectiveScope.userId);
		}

		if ("projectId" in effectiveScope) {
			parts.push("projects", effectiveScope.projectId);
		}

		if ("modelId" in effectiveScope) {
			parts.push("models", effectiveScope.modelId);
		}

		const fileName = resource.id + ".bin";
		return new Path(parts, fileName);
	}

	/**
	 * Creates a Path from an explicit list of directory names and a filename.
	 * Automatically prepends the root cache directory name.
	 *
	 * @param directories - List of subdirectory names.
	 * @param file - The filename.
	 * @throws {Error} If the derived directory or file name violates path name restrictions.
	 */
	public static fromNames(
		directories: readonly string[],
		file: string
	): Path {
		const directoryNames = [ROOT_DIRECTORY_NAME, ...directories];
		return new Path(directoryNames, file);
	}
}
