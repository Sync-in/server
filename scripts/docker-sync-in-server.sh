#!/bin/sh

if [ "${SKIP_INIT}" != "true" ]; then
  if [ ! -f .init ]; then
      echo "Waiting for database to be ready..."
      MAX_RETRIES=30
      COUNT=0
      CONNECTED=false

      # Retry transient connection failures while the database is starting.
      while [ $COUNT -lt $MAX_RETRIES ]; do
        COUNT=$((COUNT+1))
        echo "Database connection attempt ${COUNT}/${MAX_RETRIES}..."
        if OUTPUT=$(node server/infrastructure/database/scripts/check-db.js 2>&1); then
          CONNECTED=true
          break
        else
          CHECK_EXIT_CODE=$?
          # Exit code 2 indicates an invalid database configuration, which cannot be fixed by retrying.
          if [ "$CHECK_EXIT_CODE" -eq 2 ]; then
            echo "$OUTPUT" >&2
            exit "$CHECK_EXIT_CODE"
          fi
        fi
        sleep 1
      done

      if [ "$CONNECTED" = "false" ]; then
        echo "Error: Timeout waiting for database after ${MAX_RETRIES} attempts:"
        echo "$OUTPUT"
        exit 1
      fi

      # migrate database
      if ! node server/infrastructure/database/scripts/migrate.js; then
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
      chmod 750 "${SYNCIN_APPLICATIONS_FILES_DATAPATH}"
  fi
else
  echo "SKIP_INIT invoked"
fi

if [ "${FORCE_PERMISSIONS}" = "true" ]; then
  echo "FORCE_PERMISSIONS: Applying recursive permissions (Dirs: 750, Files: 640)..."
  chmod -R u=rwX,g=rX,o= "${SYNCIN_APPLICATIONS_FILES_DATAPATH}"
fi

exec node server/main.js
