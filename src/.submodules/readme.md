# .submodules

Third-party code vendored as git submodules: repositories whose URL is outside `pixel-petals`. Add one with `git submodule add -f <url> src/.submodules/<name>`, and add its folder to [package.code-workspace](../../package.code-workspace).

Other org repositories are never submodules here. Depend on the provider repository's root as a `github:` dependency instead (see [CLAUDE.md](../../CLAUDE.md)).
