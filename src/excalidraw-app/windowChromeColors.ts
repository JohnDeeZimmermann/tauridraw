import {
  THEME,
  applyDarkModeFilter,
  colorToHex,
  isColorDark,
} from "@excalidraw/common";
import tinycolor from "tinycolor2";

import type { AppState } from "@excalidraw/excalidraw/types";

export type WindowChromeColors = {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  tabBackground: string;
  tabBackgroundActive: string;
  dotBackground: string;
  dotRing: string;
  closeHoverBackground: string;
};

const FALLBACK_BACKGROUNDS = {
  [THEME.LIGHT]: "#eceff4",
  [THEME.DARK]: "#171c24",
} as const;

const withAlpha = (color: string, alpha: number) =>
  tinycolor(color).setAlpha(alpha).toRgbString();

export const getWindowChromeColors = ({
  theme,
  viewBackgroundColor,
}: {
  theme: AppState["theme"];
  viewBackgroundColor: AppState["viewBackgroundColor"];
}): WindowChromeColors => {
  const effectiveBackground =
    theme === THEME.DARK
      ? applyDarkModeFilter(viewBackgroundColor)
      : viewBackgroundColor;
  const normalizedBackground = colorToHex(effectiveBackground);
  const fallbackBackground = FALLBACK_BACKGROUNDS[theme];
  const background =
    normalizedBackground && tinycolor(normalizedBackground).getAlpha() !== 0
      ? normalizedBackground
      : fallbackBackground;

  const isDarkBackground = isColorDark(background);
  const foreground = isDarkBackground ? "#eef3fb" : "#1c2430";

  return {
    background,
    foreground,
    mutedForeground: withAlpha(foreground, isDarkBackground ? 0.68 : 0.62),
    border: withAlpha(foreground, isDarkBackground ? 0.14 : 0.1),
    tabBackground: withAlpha(foreground, isDarkBackground ? 0.06 : 0.04),
    tabBackgroundActive: withAlpha(foreground, isDarkBackground ? 0.14 : 0.1),
    dotBackground: tinycolor
      .mix(background, foreground, isDarkBackground ? 55 : 40)
      .toHexString(),
    dotRing: withAlpha(foreground, isDarkBackground ? 0.24 : 0.16),
    closeHoverBackground: "#d93025",
  };
};
