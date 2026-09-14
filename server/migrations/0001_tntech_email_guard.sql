CREATE TRIGGER users_tntech_email_insert
BEFORE INSERT ON users
FOR EACH ROW
WHEN NEW.email <> lower(trim(NEW.email))
  OR substr(NEW.email, -11) <> '@tntech.edu'
BEGIN
  SELECT RAISE(ABORT, 'users.email must be a lowercase @tntech.edu address');
END;

CREATE TRIGGER users_tntech_email_update
BEFORE UPDATE OF email ON users
FOR EACH ROW
WHEN NEW.email <> lower(trim(NEW.email))
  OR substr(NEW.email, -11) <> '@tntech.edu'
BEGIN
  SELECT RAISE(ABORT, 'users.email must be a lowercase @tntech.edu address');
END;
