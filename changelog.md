# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `DELETE /console/instances/:agentId` — hides an offline EA instance from the customer-facing list. Enforces ownership, returns 409 if the instance is online, is idempotent, and writes an `instance_hidden` audit event. Rate-limited to 20 req/min.
- `hiddenAt` field on the `EaInstance` schema (indexed, default `null`) as the soft-hide marker; cleared automatically on `bridge:register`, telemetry updates, and online status updates so a reconnecting EA reappears.
- `lastSeenTs` (Unix milliseconds) in the `GET /console/instances` list projection.

### Security
- `GET /console/instances` now returns a slim projection (`agentId`, `accountLogin`, `symbol`, `online`, `lastSeenAt`, `lastSeenTs`) instead of full instance documents — license keys, telemetry payloads, current settings, and user IDs are no longer sent to the browser.
- `AuditEvent.InstanceHidden` (`instance_hidden`) audit event for every hide action.
