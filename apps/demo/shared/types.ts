export interface Artist {
  mbid: string;
  name: string;
  releases: Release[];
}

export interface Release {
  mbid: string;
  artists: Artist[];
  title: string;
  type: "single" | "album" | "ep" | "broadcast" | "other";
  reviews: Review[];
}

export interface Publication {
  url: string;
  feedUrl: string;
  name: string;
}

export interface Review {
  url: string;
  publication: Publication;
  release: Release;
  snippet?: string;
}

export interface Feed {
  releases: Release[];
}
