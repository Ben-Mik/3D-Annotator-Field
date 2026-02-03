# anno3d UTF-8 Format Specification (v2.0)

This document specifies the anno3d UTF-8 file format, a human-readable,
UTF-8 encoded text format for 8-bit semantic segmentation data.
It is designed to store the same information as the anno3d binary format
but organizes data by annotation class (label) rather than by index.

## 1. Invariants

-   **Encoding**: The file must be encoded in **UTF-8**.
-   **Comments**: Any line beginning with a `#` character is a comment and
    should be ignored by the parser.
-   **Whitespace**:
    -   Blank lines (or lines containing only whitespace) should be ignored.
    -   Inline whitespace (spaces or tabs) is used to separate tokens on a line.
-   **Integers**: All numbers (class IDs, counts, indices) are represented
    as base-10 (decimal) UTF-8 strings.

## 2. File Structure

The file is organized into two main sections, in order:

1.  **Header Section**: A series of key-value pairs defining the file's metadata.
2.  **Data Section**: A series of `label` blocks that list indices for each annotation class.

## 3. Header Section

The header section must be at the beginning of the file. It consists of
a "magic" comment line followed by key-value metadata.

### 3.1. Magic Identifier (Required)

The very first line of the file **must** be the "magic" comment:
`# ANNO3D-UTF-8`
This identifies the file format.

### 3.2. Metadata (Required)

The header must contain the following keys, one per line, in `key: value` format.

-   `version: <major.minor>`
    -   The file format version. For this spec: `2.0`.
    -   Example: `version: 2.0`
-   `model_type: <string>`
    -   The type of the segmented model.
    -   Valid values: `point_cloud`, `mesh`, or `texture_mesh`.
    -   Example: `model_type: texture_mesh`
-   `texture_width: <integer>`
    -   **Required if and only if** `model_type` is `texture_mesh`.
    -   The width of the texture in pixels.
    -   Example: `texture_width: 1024`
-   `texture_height: <integer>`
    -   **Required if and only if** `model_type` is `texture_mesh`.
    -   The height of the texture in pixels.
    -   Example: `texture_height: 1024`
-   `total_elements: <integer>`
    -   **Required if and only if** `model_type` is `point_cloud` or `mesh`.
    -   Specifies the total number of elements (points or faces) in the model.
    -   This is necessary for the parser to correctly size the final `AnnotationsLUT`, as unannotated elements are not listed in the data section.
    -   This field is redundant for the `texture_mesh` model_type, as the total is `texture_width * texture_height`.
    -   Example: `total_elements: 8192`

### 3.3. Data Separator (Required)

The header section **must** be terminated by a line containing only the
text `data_start`. This signals the end of the header and the beginning
of the data section.

## 4. Data Section

The data section follows the `data_start` line. It is composed of one or
more `label` blocks. Each block defines the set of indices belonging to
a single class.

### 4.1. Label Block Structure

Each block consists of a `label` directive line followed by a list of indices.

1.  **Label Directive Line**:
    -   Format: `label <annotation_class> <index_count>`
        -   `label`: The literal UTF-8 string "label".
        -   `<annotation_class>`: An unsigned 8-bit integer (0-255) representing the annotation class.
        -   `<index_count>`: An unsigned integer specifying the exact number of indices that follow for this class.
2.  **Index List**:
    -   Following the directive line, there must be exactly `<index_count>` lines.
    -   Each line must contain a single unsigned integer (e.g., 64-bit)representing an index (of a point, face, or pixel).
    -   For `texture_mesh` models, pixel indices are calculated as `y * width + x`.

## 5. Example File

This example shows a 4x4 texture segmentation with two annotation classes (3 and 7).

```
# ANNO3D-UTF-8
#
# This is an example segmentation file for a small texture.

# --- Header Section ---
version: 2.0
model_type: texture
texture_width: 4
texture_height: 4

# --- Data Section ---
data_start

# Class 3 has 5 pixels
label 3 5
0
1
4
5
6

# Class 7 has 3 pixels
label 7 3
10
11
15

# Class 42 has 0 pixels (This is valid)
label 42 0
```
