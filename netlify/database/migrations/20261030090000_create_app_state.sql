-- Der gesamte Dashboard-Stand liegt als ein JSON-Dokument in einer Zeile.
-- version zählt bei jedem Speichern hoch und schützt vor gegenseitigem Überschreiben.
CREATE TABLE app_state (
  id text PRIMARY KEY,
  version integer NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
