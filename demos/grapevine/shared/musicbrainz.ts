import type { IRelease } from "musicbrainz-api";
import { createContext } from "streamweaver";

export type MusicBrainzRelease = IRelease;

export const MusicBrainzReleaseContext = createContext<MusicBrainzRelease>();
