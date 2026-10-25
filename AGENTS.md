# Agent Instructions

Notes for AI agents working in this repository.

## Code review

This repo sets `greptile.json` to `{"skipReview": "AUTOMATIC"}` so Greptile only reviews a pull request on demand, when the `second-opinion` label is applied; CodeRabbit reviews are requested explicitly by maintainers. Automatic and per-push reviews are disabled; after a fix batch, request an incremental review of the current head. Keep the normal review and required-check gates.
