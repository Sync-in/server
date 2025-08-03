docker compose pull sync_in_desktop_releases
docker compose down sync_in
docker volume rm sync-in_desktop_releases
docker compose run --rm sync_in_desktop_releases
docker compose up sync_in -d