# Vnosko Lite: npm

Status 2026-10-17: built and checked; public repository https://github.com/pnscripts/vnosko-lite with tag v1.0.0; **not on npm yet**. Two owner steps first: (1) the npm account e-mail must be office@pnscripts.com (npm shows it in `maintainers`; same open item as Linkrinse Lite), (2) `npm login`.

Then: `npm publish` from the repository root (publishConfig access public; `prepack` builds dist/). Check `npm view @pnscripts/vnosko-lite maintainers author license` shows only PN Scripts.
