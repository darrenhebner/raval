import { createContext } from "streamweaver";
import type { Feed } from "./types";

export const FeedContext = createContext<Feed>();
