#!/bin/sh

if [ "${SKIP_INIT}" != "true" ]; then
  if [ ! -f .init ]; then
      echo "Waiting for database to be ready..."
      MAX_RETRIES=30
      COUNT=0
      CONNECTED=false

      while [ $COUNT -lt $MAX_RETRIES ]; do
        COUNT=$((COUNT+1))
        echo "Database connection attempt ${COUNT}/${MAX_RETRIES}..."
        if OUTPUT=$(node server/infrastructure/database/scripts/check-db.js 2>&1); then
          CONNECTED=true
          break
        fi
        sleep 1
      done

      if [ "$CONNECTED" = "false" ]; then
        echo "Error: Timeout waiting for database after ${MAX_RETRIES} attempts:"
        echo "$OUTPUT"
        exit 1
      fi

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
      chmod 750 /app/data
  fi
else
  echo "SKIP_INIT invoked"
fi

if [ "${FORCE_PERMISSIONS}" = "true" ]; then
  echo "FORCE_PERMISSIONS: Applying recursive permissions (Dirs: 750, Files: 640)..."
  chmod -R u=rwX,g=rX,o= /app/data
fi

exec node server/main.js