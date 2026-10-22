import { productionOnlyExternalLink } from "./lib/externalResourceLinks.js";
const DEFAULT_GAS_BASE_URL =
  "https://script.google.com/macros/s/AKfycby74IilU88WnpwbJNNcXxO1llF8VdBuhrMVk5PnFUzZy0DfXm-dSqyBhPB3_Uu2KNQ/exec";

export const GAS_BASE_URL =
  productionOnlyExternalLink(import.meta.env.VITE_GAS_BASE_URL || DEFAULT_GAS_BASE_URL);
