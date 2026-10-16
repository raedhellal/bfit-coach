---
name: check-swap-in-its-own-call
description: Load guard - read vm.swapusage/swapouts in a separate call and decide, never in the same command that starts a dev server
metadata:
  type: feedback
---

Check `sysctl vm.swapusage` and `vm_stat` swapouts in their own Bash call, then start the heavy
job in the next one. **Why:** on EV-337g2 a chained `sysctl ...; next dev ...` printed 648 MB free
(under the brief's 1 GB line) and started the server anyway, because the check had no gate.
**How to apply:** under 1 GB, sample swapouts twice ~20 s apart; start only if they are flat.
