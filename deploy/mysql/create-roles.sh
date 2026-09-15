#!/bin/sh
set -eu

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
: "${BANTAI_DB_RUNTIME_PASSWORD:?BANTAI_DB_RUNTIME_PASSWORD is required}"
: "${BANTAI_DB_MIGRATION_PASSWORD:?BANTAI_DB_MIGRATION_PASSWORD is required}"

sql_literal() {
  # MySQL string literals escape a quote by doubling it.
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"
}

runtime_password=$(sql_literal "$BANTAI_DB_RUNTIME_PASSWORD")
migration_password=$(sql_literal "$BANTAI_DB_MIGRATION_PASSWORD")

mysql --protocol=tcp -h "${MYSQL_HOST:-mysql}" -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS 'bantai_runtime'@'%' IDENTIFIED BY '$runtime_password';
ALTER USER 'bantai_runtime'@'%' IDENTIFIED BY '$runtime_password';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'bantai_runtime'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON bantai.* TO 'bantai_runtime'@'%';

CREATE USER IF NOT EXISTS 'bantai_migration'@'%' IDENTIFIED BY '$migration_password';
ALTER USER 'bantai_migration'@'%' IDENTIFIED BY '$migration_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES ON bantai.* TO 'bantai_migration'@'%';
FLUSH PRIVILEGES;
SQL

echo "PASS: least-privilege runtime and short-lived migration database roles configured."
