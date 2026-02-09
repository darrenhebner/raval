import { createContext } from "raval";
import type { Release } from "./types";

export const ReleaseContext = createContext<Release>();
