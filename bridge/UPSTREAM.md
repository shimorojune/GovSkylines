# Upstream

This folder is a fork of **CS2MCP.Bridge** from
[LancerComet/cities-skylines-2-mcp](https://github.com/LancerComet/cities-skylines-2-mcp),
licensed under the Apache License 2.0 (see `LICENSE` in this folder).

- Forked from commit `72bd7e0bfa01c8d263d2a069a468b413318e8bb8` (2026-10-20).
- Upstream notes that `CreateDefinitions.cs` is ported from LineTool-CS2 (Apache-2.0) and that parts are
  derived from decompiled game code, which is subject to the Paradox Interactive User Agreement.
- GovSkylines maintains this fork. Files we change carry a note saying so, as Apache-2.0 section 4(b) requires.
- Not affiliated with Colossal Order or Paradox Interactive.

## Status

Unmodified so far. Project and namespace names are still `CS2MCP.*` so upstream fixes can be merged
while we're close to it. Renaming is a deliberate later step.

## Build (Windows, Steam CS2, .NET 8 SDK)

```powershell
dotnet build bridge\CS2MCP.Bridge.csproj
```

The build finds the game through `-p:GamePath=...`, `CS2_PATH`, `CSII_INSTALLATIONPATH`, or common Steam
locations, and deploys to the game's local Mods folder. Check `CS2MCP.log` in the game's Logs folder for
`bridge listening on`. The default port is 8642 (`CS2MCP_PORT`); an optional shared secret is `CS2MCP_TOKEN`.
