# Availability

`AvailabilityModule` tracks the runtime state of infrastructure dependencies such as the database, cache, and WebSocket transport.
It is global and must be imported once by `AppModule`. Isolated Nest test modules must import it explicitly when they rely on this behavior.

Infrastructure adapters own their connection and retry logic. They register their dependency with `Availability` and update its state when the
connection is established, lost, or restored:

```typescript
this.availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)
this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)
```

`AvailabilityGuard` is registered as an application guard. It returns HTTP `503 Service unavailable` while at least one registered dependency is
unavailable.

Routes that must remain reachable during an outage can use `@AvailabilitySkip()`. This exemption should be limited to endpoints that do not access the
monitored dependencies, such as `/api/auth/logout`.

`INFRASTRUCTURE_CONNECTION_RETRY_DELAY` provides the shared delay used by infrastructure reconnection loops. The availability module only stores and
exposes state; it does not reconnect dependencies itself.

## Health endpoints

`GET /healthz/live` reports whether the HTTP process is alive. It always returns HTTP `200` with `{ "status": "ok" }` once the server is listening.

`GET /healthz/ready` reports whether every registered dependency is available. It returns HTTP `200` with `{ "status": "ok" }` when the service is
ready and HTTP `503` with `{ "status": "unavailable" }` otherwise.

Both endpoints are unauthenticated, bypass `AvailabilityGuard`, return `Cache-Control: no-store`, and expose no dependency details.

## Docker health checks

The Sync-in container image runs the compiled `server/infrastructure/availability/scripts/check-health.js` script, which sends a `GET` request to
`/healthz/ready`. By default, the check runs inside the container against `http://127.0.0.1:8080/healthz/ready`, so it is independent of the published
host port and Docker Compose DNS. The target can be overridden with the `SYNC_IN_HEALTHCHECK_URL` container environment variable.

The script does not follow redirects and accepts only HTTP `200` as a successful result. Any other HTTP status, a missing or invalid target URL, or a
network error causes the Docker health check to fail.

The Docker Compose setup also checks that MariaDB accepts connections and has initialized InnoDB before starting Sync-in. The existing startup retry
loop remains in place for direct `docker run` usage and as an additional safeguard.

An unavailable registered dependency marks the Sync-in container as unhealthy while the application keeps running and attempts to reconnect. Docker's
`restart: always` policy restarts a stopped container; the health status alone does not trigger a restart.
