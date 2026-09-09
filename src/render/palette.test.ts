import { describe, expect, it } from "vitest";
import { hexToRgb } from "./palette";

describe("hexToRgb", () => {
  it("converts a six-digit hex to normalised floats", () => {
    expect(hexToRgb("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("expands shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([1, 1, 1]);
  });

  it("tolerates surrounding whitespace, as getPropertyValue returns it", () => {
    expect(hexToRgb("  #4ff0d0 ")[0]).toBeCloseTo(0.31, 1);
  });

  it("returns black rather than NaN for junk", () => {
    // A missing custom property would otherwise push NaN into a uniform and
    // blank the whole shader.
    expect(hexToRgb("")).toEqual([0, 0, 0]);
    expect(hexToRgb("#12")).toEqual([0, 0, 0]);
  });
});
