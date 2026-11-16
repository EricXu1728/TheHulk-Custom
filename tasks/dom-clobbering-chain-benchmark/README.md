# Multi-gadget chain benchmark

Open `benchmark.ipynb` from Jupyter. It locates the examples under `data/multi-gadget-chains`, creates safety-adjusted temporary copies, and invokes `tasks/dom-clobbering-site-scan/scan.sh` once for each page.

Start TheHulk's proxy in another WSL terminal first. The notebook defaults to proxy port 8899; update `PROXY_PORT` if needed. It chooses Node.js 14+ from `~/.local/bin`, `~/.nvm`, or `PATH` for scan subprocesses.

The original examples put the clobbering payload after synchronous app code. The notebook moves its marked payload block before that code in the temporary copy. Placeholder attacker hosts become loopback URLs; alert and cookie-transfer effects become harmless console messages. The original files are not changed.

The benchmark measures flows on pages that already contain documented payloads. It does not show that the generic scanner independently synthesized those payloads. The current scanner generates anchor-oriented candidates and cannot infer every DOM shape or branch-dependent chain.
