const DEFAULT_GAS_BASE_URL =
  "https://script.google.com/macros/s/AKfycbw85hs1ARcXvoynC63n8Rl48A7_tmnPh1PYHARfoHmtKZBCgvQJDzdz1_lcYG0fIz3q/exec";

export const GAS_BASE_URL =
  import.meta.env.VITE_GAS_BASE_URL || DEFAULT_GAS_BASE_URL;
