-- Auth service schema. Kept in its own Postgres schema (not the default
-- "public" one) so future app data (e.g. saved scores) can live alongside it
-- in the same database without name clashes.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.tenants (
    id UUID PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenant_id is nullable: an app_admin is platform staff, not part of any
-- customer's organization.
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES auth.tenants (id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, username)
);

-- Postgres treats NULL as distinct from NULL in a composite UNIQUE
-- constraint, so the constraint above does NOT stop two app_admins (both
-- tenant_id IS NULL) from sharing a username - this partial index does.
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_platform_username
    ON auth.users (username) WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_users_tenant ON auth.users (tenant_id);
