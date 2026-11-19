---
type: task (AFK)
status: resolved
---
## Question
In the category field (`web/src/TagInput.tsx`) text that was typed but not confirmed with Enter is dropped when the field loses focus (the blur handler only keeps it when there is no catalog search). A visitor who types "shoes" and clicks **Sign** loses the word without being told.

## Recommended answer
On blur with pending text, keep it as a visible, dismissible hint ("Press Enter to add 'shoes'") instead of clearing it silently. Needs a browser check (`npm run screenshots` style), so it was left out of the review PR.


## Resolution (2026-11-19)
on blur with pending text and a catalog search the word stays and a "not added yet, press Enter" hint shows (no silent loss). Browser screenshot check still to do.


## Resolution (2026-11-19)
Browser check done 2026-11-19: with the draft form open, typing "grip socks" in Categories and clicking elsewhere leaves the word in the field and shows the "not added yet" hint (all four runs). The script clears the field afterwards.
