#!/bin/sh
set -eu

: "${PUID:?PUID is not defined}"
: "${PGID:?PGID is not defined}"

# Create syncin group if needed
group_name=$(getent group "${PGID}" | cut -d: -f1)
if [ -z "${group_name}" ]; then
    addgroup -g "${PGID}" syncin
    group_name="syncin"
fi

# Create syncin user if needed
# NOTE: if the user already exists, we won't change its primary group since su-exec already forces the correct group id
if ! getent passwd "${PUID}" >/dev/null 2>&1; then
    adduser -D -u "${PUID}" -G "${group_name}" -s /bin/sh syncin
fi

# Change /app ownership to syncin (for writing .init file)
chown "${PUID}:${PGID}" /app

# Change application data ownership to syncin if needed
CURRENT_UID=$(stat -c '%u' /app/data)
CURRENT_GID=$(stat -c '%g' /app/data)

if [ "${CURRENT_UID}" != "${PUID}" ] || [ "${CURRENT_GID}" != "${PGID}" ]; then
    chown -R "${PUID}:${PGID}" /app/data
fi

# Launch server as syncin user
exec su-exec "${PUID}:${PGID}" "$@"
