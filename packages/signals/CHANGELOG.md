# @umpire/signals

## 0.1.0-alpha.9

### Patch Changes

- Vue and Solid adapter support added alongside existing alien/preact/tc39 signal adapters

## 0.1.0-alpha.8

_Version skipped (internal)_

## 0.1.0-alpha.7

### Major Changes

- `flag()` → `play()` rename (follows core)

## 0.1.0-alpha.5

### Patch Changes

- Fixed signal cycle: removed `version.set()` inside effect (was causing infinite update loops)
- `penalties` → `fouls` rename (follows core)

## 0.1.0-alpha.4

### Patch Changes

- `context` → `conditions` rename (follows core)
- Converted signals demos to native Preact

## 0.1.0-alpha.2

### Minor Changes

- Initial release: reactive adapter with alien-signals, preact/signals, TC39 proposal support
- `SignalProtocol` interface for pluggable signal libraries
