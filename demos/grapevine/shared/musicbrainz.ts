import type { IRelease } from "musicbrainz-api";
import { createContext } from "raval";

export type MusicBrainzRelease = IRelease;

export const MusicBrainzReleaseContext = createContext<MusicBrainzRelease>();
