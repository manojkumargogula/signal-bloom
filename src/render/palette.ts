import type { NebulaPalette } from "./webgl/NebulaLayer";

/**
 * Reads the shader palette out of the CSS custom properties.
 *
 * One source of truth: the stylesheet defines the theme, and the shader reads
 * the same values. Hardcoding the hexes here would mean the sky and the
 * interface drift apart the first time either is tuned.
 */
function readVar(styles: CSSStyleDeclaration, name: string): [number, number, number] {
  const raw = styles.getPropertyValue(name).trim();
  return hexToRgb(raw);
}

export function hexToRgb(hex: string): [number, number, number] {
  let value = hex.replace("#", "").trim();
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (value.length < 6) return [0, 0, 0];
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

export function readPalette(): NebulaPalette {
  const styles = getComputedStyle(document.documentElement);
  const lightMode = document.documentElement.dataset.theme === "light";
  return {
    ink: readVar(styles, "--bg"),
    amber: readVar(styles, "--amber"),
    lightMode,
  };
}

export function readColour(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
