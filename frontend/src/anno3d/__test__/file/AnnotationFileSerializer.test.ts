import { Format, formatFileHeader, Version } from "../../v1";

describe("AnnotationFileSerializer", () => {
	test("formatFileHeader", () => {
		const header = `format ${Format.UTF8}\nversion ${Version.ONE}`;
		expect(formatFileHeader(Format.UTF8, Version.ONE)).toBe(header);
	});
});
