export type FontRole = "sans" | "serif" | "display" | "script" | "mono";
export type CatalogueFont = { family: string; role: FontRole; weights: number[]; pkg: string };

const W = [400, 500, 600, 700];
/** Built-in families (OFL, from @fontsource), shared by the editor's pickers and the export renderer. Weights are the latin files that exist. */
export const FONTS: CatalogueFont[] = [
  { family: "Inter", role: "sans", weights: W, pkg: "@fontsource/inter" },
  { family: "Space Grotesk", role: "sans", weights: [400, 500, 600, 700], pkg: "@fontsource/space-grotesk" },
  { family: "Poppins", role: "sans", weights: W, pkg: "@fontsource/poppins" },
  { family: "Montserrat", role: "sans", weights: W, pkg: "@fontsource/montserrat" },
  { family: "DM Sans", role: "sans", weights: W, pkg: "@fontsource/dm-sans" },
  { family: "Playfair Display", role: "serif", weights: W, pkg: "@fontsource/playfair-display" },
  { family: "Lora", role: "serif", weights: W, pkg: "@fontsource/lora" },
  { family: "Bebas Neue", role: "display", weights: [400], pkg: "@fontsource/bebas-neue" },
  { family: "Abril Fatface", role: "display", weights: [400], pkg: "@fontsource/abril-fatface" },
  { family: "Dancing Script", role: "script", weights: W, pkg: "@fontsource/dancing-script" },
  { family: "Pacifico", role: "script", weights: [400], pkg: "@fontsource/pacifico" },
  { family: "JetBrains Mono", role: "mono", weights: W, pkg: "@fontsource/jetbrains-mono" },
];
