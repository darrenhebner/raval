import { createContext } from "streamweaver";
import type { IRelease } from "musicbrainz-api";

export type MusicBrainzRelease = IRelease;

export const MusicBrainzReleaseContext = createContext<MusicBrainzRelease>();
