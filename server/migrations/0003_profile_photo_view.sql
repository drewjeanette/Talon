ALTER TABLE user_profile_photos ADD COLUMN view_zoom REAL NOT NULL DEFAULT 1;
ALTER TABLE user_profile_photos ADD COLUMN view_x REAL NOT NULL DEFAULT 0;
ALTER TABLE user_profile_photos ADD COLUMN view_y REAL NOT NULL DEFAULT 0;
