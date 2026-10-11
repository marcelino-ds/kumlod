-- +goose Up
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,              -- hex SHA-256 of the cookie token
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent   TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,                     -- 'app', 'vapid'
    value TEXT NOT NULL                         -- JSON
) STRICT;

CREATE TABLE semesters (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    academic_year TEXT NOT NULL DEFAULT '',
    term          TEXT NOT NULL CHECK (term IN ('odd', 'even', 'short')),
    start_date    TEXT NOT NULL,
    end_date      TEXT NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX semesters_single_active ON semesters(is_active) WHERE is_active = 1;

CREATE TABLE courses (
    id                 TEXT PRIMARY KEY,
    semester_id        TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    code               TEXT NOT NULL DEFAULT '',
    name               TEXT NOT NULL,
    credits            INTEGER NOT NULL CHECK (credits BETWEEN 0 AND 24),
    lecturer           TEXT NOT NULL DEFAULT '',
    color              TEXT NOT NULL DEFAULT '#6366f1',
    total_meetings     INTEGER NOT NULL CHECK (total_meetings BETWEEN 1 AND 40),
    min_attendance_pct INTEGER NOT NULL CHECK (min_attendance_pct BETWEEN 0 AND 100),
    final_grade_letter TEXT,
    notes              TEXT NOT NULL DEFAULT '',
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
) STRICT;
CREATE INDEX courses_semester ON courses(semester_id);

CREATE TABLE course_schedules (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),   -- ISO: 1 = Monday
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    room        TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX course_schedules_course ON course_schedules(course_id);

CREATE TABLE meetings (
    id            TEXT PRIMARY KEY,
    course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    number        INTEGER NOT NULL,
    date          TEXT NOT NULL,
    start_time    TEXT NOT NULL DEFAULT '',
    end_time      TEXT NOT NULL DEFAULT '',
    room          TEXT NOT NULL DEFAULT '',
    kind          TEXT NOT NULL DEFAULT 'lecture' CHECK (kind IN ('lecture', 'midterm', 'final')),
    status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    attendance    TEXT CHECK (attendance IN ('present', 'excused', 'sick', 'absent')),
    attendance_at TEXT,
    topic         TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
) STRICT;
CREATE INDEX meetings_course ON meetings(course_id, date);
CREATE INDEX meetings_date ON meetings(date);

CREATE TABLE grade_components (
    id        TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    weight    REAL NOT NULL CHECK (weight > 0 AND weight <= 100),
    score     REAL CHECK (score >= 0 AND score <= 100),
    source    TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'tasks')),
    position  INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX grade_components_course ON grade_components(course_id);

CREATE TABLE tasks (
    id                 TEXT PRIMARY KEY,
    semester_id        TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    course_id          TEXT REFERENCES courses(id) ON DELETE CASCADE,
    meeting_id         TEXT REFERENCES meetings(id) ON DELETE SET NULL,
    grade_component_id TEXT REFERENCES grade_components(id) ON DELETE SET NULL,
    title              TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    deadline           TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'submitted', 'graded')),
    priority           TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    submission_url     TEXT NOT NULL DEFAULT '',
    score              REAL CHECK (score >= 0 AND score <= 100),
    completed_at       TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
) STRICT;
CREATE INDEX tasks_semester_deadline ON tasks(semester_id, deadline);
CREATE INDEX tasks_course ON tasks(course_id);
CREATE INDEX tasks_component ON tasks(grade_component_id);
CREATE INDEX tasks_meeting ON tasks(meeting_id);

CREATE TABLE files (
    id            TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    sha256        TEXT NOT NULL,
    created_at    TEXT NOT NULL
) STRICT;

CREATE TABLE materials (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    meeting_id  TEXT REFERENCES meetings(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('link', 'note', 'file')),
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    file_id     TEXT REFERENCES files(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
) STRICT;
CREATE INDEX materials_course ON materials(course_id);
CREATE INDEX materials_meeting ON materials(meeting_id);
CREATE INDEX materials_file ON materials(file_id);

CREATE VIRTUAL TABLE materials_fts USING fts5(
    material_id UNINDEXED,
    title,
    description,
    file_name,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE push_subscriptions (
    id              TEXT PRIMARY KEY,
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    user_agent      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    last_success_at TEXT
) STRICT;

CREATE TABLE notification_log (
    kind    TEXT NOT NULL,
    ref     TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (kind, ref)
) STRICT;

-- +goose Down
DROP TABLE notification_log;
DROP TABLE push_subscriptions;
DROP TABLE materials_fts;
DROP TABLE materials;
DROP TABLE files;
DROP TABLE tasks;
DROP TABLE grade_components;
DROP TABLE meetings;
DROP TABLE course_schedules;
DROP TABLE courses;
DROP TABLE semesters;
DROP TABLE settings;
DROP TABLE sessions;
DROP TABLE users;
