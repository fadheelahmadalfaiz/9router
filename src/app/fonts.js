import localFont from "next/font/local";

// Self-host Material Symbols Outlined so Next.js can:
// - Add a <link rel="preload"> so the font starts fetching during HTML parse
// - Apply the proper font-display + size-adjust strategy to avoid FOIT/FOUT
// - Hash the file and serve with long cache lifetime
//
// Source file lives at public/fonts/material-symbols-outlined.woff2 (copied
// from the material-symbols npm package at install time). Loading it via
// next/font/local means raw icon-text never flashes on screen because the
// preload starts before React hydration.
export const materialSymbols = localFont({
  src: "../../public/fonts/material-symbols-outlined.woff2",
  display: "block",
  weight: "100 700",
  style: "normal",
  variable: "--font-material-symbols",
});
