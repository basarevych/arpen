--
-- Prepare
--

DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

DROP TYPE IF EXISTS job_status;


--
-- Common functions
--

CREATE OR REPLACE FUNCTION invalidate_cache(cache_keys text[]) RETURNS VOID AS $$
DECLARE
    row record;
BEGIN
    FOR row IN SELECT DISTINCT unnest(cache_keys) AS name LOOP
        PERFORM pg_notify('invalidate_cache', '{ "key": "' || row.name || '" }');
    END LOOP;
END;
$$ LANGUAGE plpgsql;


--
-- Roles
--

CREATE TABLE roles (
    id bigserial NOT NULL,
    parent_id bigint NULL,
    name character varying(255) NOT NULL,
    CONSTRAINT roles_pk PRIMARY KEY(id),
    CONSTRAINT roles_unique_name UNIQUE (name),
    CONSTRAINT roles_parent_fk FOREIGN KEY(parent_id)
        REFERENCES roles(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION invalidate_roles_cache() RETURNS trigger AS $$
DECLARE
    cache_keys text[] := array[]::text[];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'roles-by-id:' || NEW.id
            ]
        );
    END IF;
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'roles-by-id:' || OLD.id
            ]
        );
    END IF;

    PERFORM invalidate_cache(cache_keys);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache
    AFTER INSERT OR UPDATE OR DELETE
    ON roles
    FOR EACH ROW
    EXECUTE PROCEDURE invalidate_roles_cache();


--
-- Permissions
--

CREATE TABLE permissions (
    id bigserial NOT NULL,
    role_id bigint NOT NULL,
    resource character varying(255) NULL,
    action character varying(255) NULL,
    CONSTRAINT permissions_pk PRIMARY KEY(id),
    CONSTRAINT permissions_role_fk FOREIGN KEY(role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION invalidate_permissions_cache() RETURNS trigger AS $$
DECLARE
    cache_keys text[] := array[]::text[];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'permissions-by-id:' || NEW.id,
                'permissions-by-role-id:' || NEW.role_id
            ]
        );
    END IF;
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'permissions-by-id-id:' || OLD.id,
                'permissions-by-role-id:' || OLD.role_id
            ]
        );
    END IF;

    PERFORM invalidate_cache(cache_keys);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache
    AFTER INSERT OR UPDATE OR DELETE
    ON permissions
    FOR EACH ROW
    EXECUTE PROCEDURE invalidate_permissions_cache();


--
-- Users
--

CREATE TABLE users (
    id bigserial NOT NULL,
    name character varying(255) NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    created_at timestamp NOT NULL,
    blocked_at timestamp NULL,
    CONSTRAINT users_pk PRIMARY KEY (id),
    CONSTRAINT users_unique_email UNIQUE (email)
);

CREATE TABLE user_roles (
    user_id bigserial NOT NULL,
    role_id bigserial NOT NULL,
    CONSTRAINT user_roles_pk PRIMARY KEY(user_id, role_id),
    CONSTRAINT user_roles_user_fk FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT user_roles_role_fk FOREIGN KEY(role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION invalidate_users_cache() RETURNS trigger AS $$
DECLARE
    cache_keys text[] := array[]::text[];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'users-by-id:' || NEW.id,
                'users-by-email:' || NEW.email
            ]
        );
    END IF;
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'users-by-id:' || OLD.id,
                'users-by-email:' || OLD.email
            ]
        );
    END IF;

    PERFORM invalidate_cache(cache_keys);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache
    AFTER INSERT OR UPDATE OR DELETE
    ON users
    FOR EACH ROW
    EXECUTE PROCEDURE invalidate_users_cache();

CREATE OR REPLACE FUNCTION invalidate_user_roles_cache() RETURNS trigger AS $$
DECLARE
    cache_keys text[] := array[]::text[];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'roles-by-user-id:' || NEW.user_id
            ]
        );
    END IF;
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'roles-by-user-id:' || OLD.user_id
            ]
        );
    END IF;

    PERFORM invalidate_cache(cache_keys);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache
    AFTER INSERT OR UPDATE OR DELETE
    ON user_roles
    FOR EACH ROW
    EXECUTE PROCEDURE invalidate_user_roles_cache();


--
-- Sessions
--

CREATE TABLE sessions (
    id bigserial NOT NULL,
    user_id bigint NULL,
    payload jsonb NOT NULL,
    info jsonb NOT NULL,
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL,
    CONSTRAINT sessions_pk PRIMARY KEY (id),
    CONSTRAINT sessions_user_fk FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION invalidate_sessions_cache() RETURNS trigger AS $$
DECLARE
    cache_keys text[] := array[]::text[];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'sessions-by-id:' || NEW.id
            ]
        );
    END IF;
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'sessions-by-id:' || OLD.id
            ]
        );
    END IF;

    PERFORM invalidate_cache(cache_keys);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache
    AFTER INSERT OR UPDATE OR DELETE
    ON sessions
    FOR EACH ROW
    EXECUTE PROCEDURE invalidate_sessions_cache();


--
-- Jobs
--

CREATE TYPE job_status AS ENUM ('pending', 'running', 'expired', 'failure', 'success');

CREATE TABLE jobs (
    id bigserial NOT NULL,
    status job_status NOT NULL,
    queue character varying(255) NULL,
    script character varying(255) NOT NULL,
    input jsonb NOT NULL,
    output jsonb NOT NULL,
    target character varying(255) NULL,
    schedule_start timestamp NULL,
    schedule_end timestamp NULL,
    created_at timestamp NOT NULL,
    created_by character varying(255) NOT NULL,
    started_at timestamp NULL,
    started_by character varying(255) NULL,
    finished_at timestamp NULL,
    CONSTRAINT jobs_pk PRIMARY KEY(id)
);

CREATE OR REPLACE FUNCTION invalidate_jobs_cache() RETURNS trigger AS $$
DECLARE
    cache_keys text[] := array[]::text[];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'jobs-by-id:' || NEW.id
            ]
        );
    END IF;
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        cache_keys = array_cat(
            cache_keys,
            array[
                'jobs-by-id:' || OLD.id
            ]
        );
    END IF;

    PERFORM invalidate_cache(cache_keys);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_cache
    AFTER INSERT OR UPDATE OR DELETE
    ON jobs
    FOR EACH ROW
    EXECUTE PROCEDURE invalidate_jobs_cache();


--
-- Views
--

CREATE VIEW roles_search AS
    SELECT r1.*,
           r2.name AS parent_name
      FROM roles r1
 LEFT JOIN roles r2
        ON r2.id = r1.parent_id;

CREATE VIEW permissions_search AS
    SELECT p.*,
           r.name AS role_name
      FROM permissions p
 LEFT JOIN roles r
        ON r.id = p.role_id;

CREATE VIEW users_search AS
    SELECT u.*,
           string_agg(DISTINCT r.name, ', ' ORDER BY r.name) AS roles,
           (SELECT count(s.*)
              FROM sessions s
             WHERE s.user_id = u.id) AS sessions
      FROM users u
 LEFT JOIN user_roles ur
        ON ur.user_id = u.id
 LEFT JOIN roles r
        ON r.id = ur.role_id
  GROUP BY u.id;

CREATE VIEW sessions_search AS
    SELECT s.id,
           s.user_id,
           u.email AS user_email,
           s.info->'ip_address' AS ip_address,
           s.created_at,
           s.updated_at
      FROM sessions s
 LEFT JOIN users u
        ON u.id = s.user_id;
