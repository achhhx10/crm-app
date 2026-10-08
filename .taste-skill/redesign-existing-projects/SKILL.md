# Redesign Audit: CRM Prospection
## Typography
- Inter acceptable for neutral CRM (taste-skill §4.1)
- Add JetBrains Mono for tabular numbers (KPIs, revenue)
- text-balance for headings
- Leading-[1.1] for italic descenders
## Color
- Navy base (222 47% 11%) + amber accent (38 92% 50%)
- No oversaturated accents. Tint shadows to background hue.
- No pure black #000. Use off-black.
- One palette, consistent warm/cool grays
## Layout  
- Break centered symmetry with offset
- Max-width container
- 8pt grid rhythm
- No 3-equal-card feature rows
## Components
- Button: hover shift, scale-[0.98] on :active
- Card: hover:shadow-md, no border if not needed for hierarchy
- Dialog: animate opacity+scale, focus trap
- Toast: slide in, icon, progress bar
- Loading: skeleton matching layout shape
## Anti-patterns to ban
- AI purple gradient
- 3-equal-cards
- Em-dashes as design flourish
- Generic box-shadow (tint to bg)
- Placeholder-as-label (never)
