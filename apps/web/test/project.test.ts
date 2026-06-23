import { describe, it, expect } from "vitest";
import { PROJECT_TAG_PREFIX, isProjectTag, projectTag, projectName } from "../src/project";

describe("project tag helpers", () => {
  it("prefix is prj:", () => {
    expect(PROJECT_TAG_PREFIX).toBe("prj:");
  });
  it("isProjectTag distinguishes prj: from semantic tags", () => {
    expect(isProjectTag("prj:みなそこ")).toBe(true);
    expect(isProjectTag("サビ")).toBe(false);
  });
  it("projectTag / projectName round-trip", () => {
    expect(projectTag("みなそこ")).toBe("prj:みなそこ");
    expect(projectName("prj:みなそこ")).toBe("みなそこ");
    expect(projectName("サビ")).toBe("サビ"); // 非prj: はそのまま
  });
});
