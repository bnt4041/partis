-- Saved scores, shared within an organization (any member can see/open a
-- score saved by anyone else in the same tenant). Kept in its own schema,
-- separate from auth.
CREATE SCHEMA IF NOT EXISTS scores;

CREATE TABLE IF NOT EXISTS scores.scores (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES auth.tenants (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    abc TEXT NOT NULL,
    -- Not a FK to auth.users on purpose: a score should stay readable even
    -- after the user who saved it is removed, so we snapshot the username
    -- for display instead of requiring the row to still exist.
    created_by UUID,
    created_by_username TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scores_tenant ON scores.scores (tenant_id);
