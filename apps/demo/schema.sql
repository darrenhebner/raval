DROP TABLE IF EXISTS release_artists;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS releases;
DROP TABLE IF EXISTS artists;
DROP TABLE IF EXISTS publications;

CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  feed_url TEXT
);

CREATE TABLE IF NOT EXISTS artists (
  mbid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS releases (
  mbid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  date TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS release_artists (
  release_mbid TEXT NOT NULL,
  artist_mbid TEXT NOT NULL,
  PRIMARY KEY (release_mbid, artist_mbid),
  FOREIGN KEY (release_mbid) REFERENCES releases(mbid) ON DELETE CASCADE,
  FOREIGN KEY (artist_mbid) REFERENCES artists(mbid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  publication_id INTEGER NOT NULL,
  release_mbid TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  snippet TEXT,
  score TEXT,
  author TEXT,
  published_at TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (publication_id) REFERENCES publications(id),
  FOREIGN KEY (release_mbid) REFERENCES releases(mbid)
);

CREATE INDEX IF NOT EXISTS idx_reviews_release_mbid ON reviews(release_mbid);
CREATE INDEX IF NOT EXISTS idx_release_artists_artist_mbid ON release_artists(artist_mbid);
