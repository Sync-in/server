#!/bin/sh

if [ "${SKIP_INIT}" != "true" ]; then
  if [ ! -f .init ]; then
      # wait for database
      sleep 8
      # migrate database
      if ! npx drizzle-kit migrate --config=server/infrastructure/database/configuration.js; then
        echo "Error: unable to migrate database schema !" >&2
        exit 1
      fi
      # if INIT_ADMIN is defined (regardless of its value)
      if [ "${INIT_ADMIN+x}" ]; then
        echo "INIT_ADMIN invoked"
        # create an administrator account if one doesn’t already exist, using the supplied login and password when provided
        if ! node server/infrastructure/database/scripts/create-user.js --role admin --login "${INIT_ADMIN_LOGIN}" --password "${INIT_ADMIN_PASSWORD}"; then
          echo "Error: unable to create administrator !" >&2
          exit 1
        fi
      fi
      touch .init
      chmod -R 755 /app/data
  fi
else
  echo "SKIP_INIT invoked"
fi
exec node server/main.js