# anno3d PNG Format Specification (v2.0)

This document specifies how the standard PNG file format is used to store 8-bit annotation classes for 3D object segmentation.

This format is **only** applicable to the `texture_mesh` model type. It does not contain any custom metadata; all information is encoded directly in the pixel values.

## 1. File Format

-   The file **must** be a standard, lossless PNG (`.png`).
-   The file **must** be 8-bit per channel (e.g., 8-bit grayscale or 24/32-bit RGB/RGBA).
-   The `width` and `height` of the PNG image are used to define the dimensions of the annotation data.

## 2. Data Encoding (Parsable Format)

For a PNG file to be successfully parsed by `ParserPng`, it **must** adhere to a strict grayscale format.

-   The 8-bit `annotationClass` is stored in the **Red** channel.
-   The Green and Blue channels **must** contain the exact same value as the Red channel.
-   **`R = G = B = annotationClass`**
-   The Alpha channel (if present) is ignored.

A pixel's index in the `AnnotationsLUT` is calculated in row-major order:
`index = y * width + x`

> **Important:** The parser will return a `PARSING_ERROR` if it encounters a color pixel (where `R !== G` or `R !== B`). Such files are considered visual-only exports and are not parsable, as the original `annotationClass` data is lost.

## 3. Metadata

This file format does not store any custom metadata (e.g., `version`, `model_type`, or `neutral_class`) within its chunks.

All metadata is inferred by the application at parse time:

-   **`model_type`**: Is assumed to be `texture_mesh`.
-   **`width` / `height`**: Are read directly from the PNG.
-   **`neutral_class`**: This value is not stored in the file. The `ParserPng` may be configured with an `options.neutralValue` to map a specific grayscale value (e.g., `255`) to the application's internal `NEUTRAL_LABEL.annotationClass`. If not specified, the internal value is used.

## 4. Serializer Output Modes

The `SerializerPng` can generate PNGs in multiple modes. Only the `annotationClass` mode is parsable.

1.  **`annotationClass` (Parsable)**

    -   Generates a grayscale image.
    -   `Pixel(R,G,B) = (annotationClass, annotationClass, annotationClass)`
    -   Pixels corresponding to `NEUTRAL_LABEL.annotationClass` are written using the `options.neutralValue`.

2.  **`color` (Visual-Only)**

    -   Generates a color image using `Label.color`.
    -   **This format is not parsable.**

3.  **`blended` (Visual-Only)**
    -   Generates a color image by blending the `Label.color` with an original texture.
    -   **This format is not parsable.**
