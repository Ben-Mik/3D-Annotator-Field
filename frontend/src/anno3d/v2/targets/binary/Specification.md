# anno3d Binary Format Specification (v2.0)

This document specifies the anno3d binary file format.
It is a chunk-based binary format designed for extensibility, performance,
and storage of 8-bit annotation classes for 3D object segmentation.

## 1. Invariants

-   **Endianness**: All multi-byte integer values (e.g., `Uint16`, `Uint32`, `Uint64`)
    are stored in **Little-Endian** byte order.
-   **Text**: All text, including the Magic Number and Chunk IDs, is encoded as **UTF-8**.
-   **Alignment**: Chunk headers are 16 bytes. The `Data Length` field is
    8-byte aligned relative to the start of the chunk header.

## 2. File Structure

The file consists of a fixed 16-byte File Header followed by a sequence of
one or more Chunks.

1.  **File Header** (16 bytes)
2.  **Chunk 1** (Header + Data)
3.  **Chunk 2** (Header + Data)
4.  ...
5.  **Chunk N** (Header + Data)

## 3. File Header (Fixed, 16 Bytes)

The first 16 bytes of every file.
| Offset | Size | Type | Description |
| :----- | :--- | :--------- | :----------------------------------------------- |
| `0x00` | 8 | `char[8]` | **Magic Number**: The UTF-8 string `"ANNO3D_B"`. |
| `0x08` | 1 | `Uint8` | **Major Version**: `2` |
| `0x09` | 1 | `Uint8` | **Minor Version**: `0` |
| `0x0A` | 6 | `Uint8[6]` | **Reserved**: Must be `0`. For future flags. |

## 4. Chunk Structure

Each chunk consists of a 16-byte header followed by its data payload.

### 4.1. Chunk Header (16 Bytes)

| Offset | Size | Type       | Description                                                       |
| :----- | :--- | :--------- | :---------------------------------------------------------------- |
| `0x00` | 4    | `char[4]`  | **Chunk ID**: A 4-character UTF-8 name (e.g., `"HEAD"`).          |
| `0x04` | 4    | `Uint8[4]` | **Reserved**: Padding. Must be `0`.                               |
| `0x08` | 8    | `Uint64`   | **Data Length**: The size (in bytes) of the `Value` field _only_. |

### 4.2. Chunk Value (Variable Size)

-   Immediately follows the 16-byte Chunk Header.
-   The raw binary data of the chunk.
-   The size of this field is specified by the `Data Length` in its header.

## 5. Defined Chunks (v2.0)

A valid v2.0 file **must** contain one `"HEAD"` and one `"DATA"` chunk.
The `"HEAD"` chunk **must** be the first chunk.

### 5.1. "HEAD" (Metadata Chunk) - REQUIRED

Stores the primary metadata needed to interpret the segmentation data.

-   **Chunk ID**: `"HEAD"`
-   **Data Length**: `16`
-   **Value** (16 bytes):

| Offset | Size | Type       | Description        |
| :----- | :--- | :--------- | :----------------- |
| `0x00` | 4    | `Uint32`   | Mode [1]           |
| `0x04` | 2    | `Uint16`   | Texture Width [2]  |
| `0x06` | 2    | `Uint16`   | Texture Height [2] |
| `0x08` | 1    | `Uint8`    | Neutral Class [3]  |
| `0x09` | 7    | `Uint8[7]` | Reserved           |

**Field Descriptions:**

1.  **Mode**: `0`=PointCloud, `1`=Mesh, `2`=Texture Mesh
2.  **Texture Width/Height**: 0 if Mode is not `2` (Texture Mesh).
3.  **Neutral Class**: The definitive `Uint8` value that parsers **must** interpret
    as "un-annotated". Any byte in the "DATA" chunk payload matching this value is
    considered neutral. This ID must not be used by any active annotation class
    (i.e., it may not appear in the "CLST" chunk). |

### 5.2. "DATA" (Segmentation Data Chunk) - REQUIRED

Stores the main payload: the array of 8-bit annotation classes.

-   **Chunk ID**: `"DATA"`
-   **Data Length**: element count
-   **Value**:
    -   A tightly packed array of `Uint8` annotation classes.
    -   For **Texture Mode**, the array is in row-major order (`index = y * width + x`).

### 5.3. "CLST" (Annotation Classes Chunk [Class LiST]) - OPTIONAL

Provides a list of all unique annotation classes (other than neutral) for the model.
All annotation classes referenced in the `"DATA"` chunk must be included. This is an
optimization for parsers to build legends without scanning the entire `"DATA"` array.

-   **Chunk ID**: `"CLST"`
-   **Data Length**: annotation class count
-   **Value**:
    -   A tightly packed array of `Uint8` annotation classes.

## 6. Example File Layout (10x10 Texture)

This example shows a minimal file for a 10x10 texture (100 elements),
with 100 bytes of data (100 \* 1 byte/element).
| Offset | Size | Description | Value |
| :--------- | :--- | :------------------------ | :------------------ |
| **Header** | | | |
| `0x00` | 8 | Magic Number | `"ANNO3D_B"` |
| `0x08` | 1 | Major Version | `0x01` |
| `0x09` | 1 | Minor Version | `0x00` |
| `0x0A` | 6 | Reserved | `[0,0,0,0,0,0]` |
| **"HEAD"** | | | |
| `0x10` | 4 | Chunk ID | `"HEAD"` |
| `0x14` | 4 | Reserved | `[0,0,0,0]` |
| `0x18` | 8 | Data Length (for "HEAD") | `16` |
| `0x20` | 4 | HEAD Value: Mode | `2` (Texture) |
| `0x24` | 2 | HEAD Value: Width | `10` |
| `0x26` | 2 | HEAD Value: Height | `10` |
| `0x28` | 1 | HEAD Value: Neutral Class | `255` |
| `0x29` | 7 | HEAD Value: Reserved | `[0,0,0,0,0,0,0]` |
| **"DATA"** | | | |
| `0x30` | 4 | Chunk ID | `"DATA"` |
| `0x34` | 4 | Reserved | `[0,0,0,0]` |
| `0x38` | 8 | Data Length (for "DATA") | `100` |
| `0x40` | 100 | DATA Value: `Uint8` array | `[val1, val2, ...]` |
| `0x108` | | **End of File** | |
