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
