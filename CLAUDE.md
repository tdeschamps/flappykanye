# CLAUDE.md

## Karpathy Rules

Coding principles from Andrej Karpathy. Apply these to every change.

### 1. Get something end-to-end working first
Build the dumbest possible version that runs start-to-finish before optimizing any single part. A working ugly thing beats a beautiful half-thing. Premature polish hides architectural problems.

### 2. Keep it simple, stupid
Default to the simplest implementation that solves the problem. Add complexity only when forced by a concrete requirement, never speculation. If you can delete code, delete it.

### 3. Read the data, not the abstractions
Inspect actual values, shapes, and distributions. Print them. Plot them. Don't trust what you think the data looks like — look at it. Most bugs hide in unchecked assumptions about inputs.

### 4. Overfit one example before generalizing
Make it work perfectly on a single concrete case. Then add the second. Only generalize once you have 2–3 working examples that show the real shape of the abstraction.

### 5. Be suspicious of correctness
"It seems to work" is not a passing grade. Add asserts, sanity checks, sentinel inputs, and visualizations. Try to break your own code before someone else does.

### 6. Write code like everything is on fire
Code is communication. Other people (and future-you) will read it more than you write it. Name things precisely. Keep functions short and obvious. Comments explain *why*, never *what*.

### 7. Taste matters
Two implementations can be functionally identical and one is still wrong — clunkier, longer, less honest about the problem. Develop taste by reading great code and rewriting your own until it's hard to make smaller.

### 8. Speed of iteration > sophistication of tools
A tight feedback loop beats fancy infrastructure. Make the inner loop fast: instant reload, fast tests, quick visual feedback. If a change takes 30 seconds to verify, fix that before doing anything else.

### 9. The bitter lesson applies
General methods that scale with compute and data beat clever hand-engineered heuristics. When in doubt, choose the approach that gets better with more resources rather than the one that requires more cleverness.

### 10. Stay in the loop, but don't be the loop
Automate what you've done twice. Watch what you've automated. Trust nothing fully — the moment you stop looking, the system breaks in a new way.

### 11. Have a strong opinion, loosely held
Commit to an approach hard enough to learn what's wrong with it. Then drop it without ego the moment evidence says otherwise.

### 12. Ship
The unshipped great idea is worth zero. Ship the embarrassing version. Iterate in public.
