Space Grotesk 500 — Google Fonts latin subset (v22), 13 KB.
SIL Open Font License 1.1. https://fonts.google.com/specimen/Space+Grotesk/license

This is NOT a THEHUB face and must never be used as one. It is here for
exactly one thing: the ZYRN wordmark in the footer, which is another firm's
mark and is set in that firm's own type. The rule it serves is stated in
css/motion.css section 09f -- another firm's mark is not recoloured, or
re-typeset, to fit ours.

css/motion.css pins its unicode-range to U+004E, U+0052, U+0059 and U+005A --
N, R, Y, Z. The file carries the whole latin set, so widening that range would
let a stray `font-family:'Space Grotesk'` set THEHUB's own copy in another
brand's face. Do not widen it, and do not reach for this face for anything
else.
