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
  name: string;
}

export interface Review {
  url: string;
  publication: Publication;
  release: Release;
}

export interface Feed {
  releases: Release[];
}
