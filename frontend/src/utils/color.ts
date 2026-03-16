/**
 * Utility to manipulate colors
 */

/**
 * Changes the alpha (opacity) of an rgba color string
 * @param rgba The rgba string (e.g., "rgba(0, 0, 0, 0.1)")
 * @param newAlpha The new alpha value (e.g., 1.0)
 * @returns The modified rgba string
 */
export const setAlpha = (rgba: string | undefined, newAlpha: number | string): string => {
  if (!rgba) return '';
  if (!rgba.startsWith('rgba')) {
    // If it's hex, we might need a different approach, but the project seems to use rgba for dynamic colors
    return rgba;
  }
  return rgba.replace(/[\d.]+\)$/g, `${newAlpha})`);
};

/**
 * Ensures a color is solid (alpha 1.0)
 */
export const toSolidColor = (rgba: string | undefined): string => {
  return setAlpha(rgba, 1.0);
};

export const getLuminance = (color: string): number => {
  if (!color) return 0;
  let r = 0, g = 0, b = 0;
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else if (color.startsWith('rgb')) {
    const rgb = color.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      r = parseInt(rgb[0]);
      g = parseInt(rgb[1]);
      b = parseInt(rgb[2]);
    }
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export const isLight = (color: string | undefined): boolean => {
  if (!color) return false;
  return getLuminance(color) > 0.65;
};
