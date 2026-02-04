import { createContext } from "streamweaver";
import type { Release } from "./types";

export const ReleaseContext = createContext<Release>();
