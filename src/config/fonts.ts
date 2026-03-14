export interface FontPreset {
  family: string;
  regularFile: string;
  boldFile: string;
}

export const FONT_PRESETS: Record<string, FontPreset> = {
  "jetbrains-mono": { family: "JBMono", regularFile: "JetBrainsMono-Regular.ttf", boldFile: "JetBrainsMono-Bold.ttf" },
  "fira-code":      { family: "FiraCode", regularFile: "FiraCode-Regular.ttf", boldFile: "FiraCode-Bold.ttf" },
  "source-code-pro":{ family: "SourceCodePro", regularFile: "SourceCodePro-Regular.ttf", boldFile: "SourceCodePro-Bold.ttf" },
};

export const DEFAULT_FONT_PRESET = "jetbrains-mono";
