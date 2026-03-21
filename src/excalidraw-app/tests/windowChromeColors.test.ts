import { THEME, applyDarkModeFilter } from "@excalidraw/common";

import { getWindowChromeColors } from "../windowChromeColors";

describe("getWindowChromeColors", () => {
  it("returns the raw canvas background in light theme", () => {
    const colors = getWindowChromeColors({
      theme: THEME.LIGHT,
      viewBackgroundColor: "#ffd8a8",
    });

    expect(colors.background).toBe("#ffd8a8");
  });

  it("returns the rendered canvas background in dark theme", () => {
    const rawColor = "#a5d8ff";
    const colors = getWindowChromeColors({
      theme: THEME.DARK,
      viewBackgroundColor: rawColor,
    });

    expect(colors.background).toBe(applyDarkModeFilter(rawColor));
  });

  it("chooses readable foreground colors for dark and light backgrounds", () => {
    const darkColors = getWindowChromeColors({
      theme: THEME.LIGHT,
      viewBackgroundColor: "#1c2430",
    });
    const lightColors = getWindowChromeColors({
      theme: THEME.LIGHT,
      viewBackgroundColor: "#f8f9fa",
    });

    expect(darkColors.foreground).toBe("#eef3fb");
    expect(lightColors.foreground).toBe("#1c2430");
  });

  it("falls back to the light theme default for invalid colors", () => {
    const colors = getWindowChromeColors({
      theme: THEME.LIGHT,
      viewBackgroundColor: "not-a-color",
    });

    expect(colors.background).toBe("#eceff4");
  });

  it("falls back to the dark theme default for transparent colors", () => {
    const colors = getWindowChromeColors({
      theme: THEME.DARK,
      viewBackgroundColor: "transparent",
    });

    expect(colors.background).toBe("#171c24");
  });
});
