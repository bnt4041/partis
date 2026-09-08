-- Snapshots of a score's previous content, recorded automatically whenever
-- "Guardar" overwrites an existing score (see scores_service.save_score) -
-- so an earlier version of a piece can always be recovered instead of being
-- silently lost the moment someone (or a later edit) overwrites it.
CREATE TABLE IF NOT EXISTS scores.score_versions (
    id UUID PRIMARY KEY,
    score_id UUID NOT NULL REFERENCES scores.scores (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    abc TEXT NOT NULL,
    -- Not a FK to auth.users, same reasoning as scores.created_by: a version
    -- should stay readable even after that user is removed.
    created_by UUID,
    created_by_username TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_versions_score_id ON scores.score_versions (score_id, created_at DESC);
