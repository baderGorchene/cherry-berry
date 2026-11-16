# UX Overhaul — Design

## Intent

Cherry Berry works, but next to Canva it feels empty and fiddly. The user compared the two (Canva screenshots of Home, the "Create a design" dialog and the editor's Text and Uploads panels) and asked for a UI/UX that feels as good as Canva's or better — **without copying it**. The user handed every design call in this document to Claude ("you choose what to do"); each one below is Claude's call.

A screen-by-screen review of the running app (2026-11-16, 1280×800 and 375×812) found two root causes:

1. **A fresh instance has no content.** Templates, Visual library and Brand kits all open on "nothing here yet". Canva feels rich because every screen is full of thumbnails.
2. **Space and attention go to settings, not to the design.** The editor shows the page at 29% between two 200px panels; every setting sits in a long right-hand form; new text lands at 32pt on a 1920px slide and runs off the page.

Success: a person who has never used Cherry Berry signs up, picks a starter template from Home, changes the text, colours and font using only the toolbar above the canvas, and exports — without opening a panel full of numeric fields, and without feeling they are in an empty app.

## Goals

- Home that leads with making something: search, one row of format shortcuts, recent designs with large previews, starter templates.
- A "Create a design" dialog with categories, search and many real sizes.
- An editor where the design gets the space, the common settings are one click away in a toolbar above the canvas, and side panels hold content (text styles, elements, templates, uploads) rather than forms.
- Built-in starter content so no screen is empty on a new instance.
- More fonts, rendered the same in the editor and in exports.
- Phone layouts without the duplicated controls found in the review.
- Open a `.cherry` file back into the app (closes the gap found on 2026-11-16).

## Non-goals and anti-goals

- **Not a copy of Canva.** No Canva wording ("What will you Canva today?"), no Canva layout pixel-for-pixel, no platform brand logos as icons (sizes may be *named* "Instagram post", icons stay generic).
- No logo, no mascot, no user-facing AI (project-wide rules), no "Try Pro"/upsell surfaces.
- No dark mode in this round (Canva's screenshots are dark; Cherry Berry stays light, palette unchanged).
- No video, whiteboards, sheets, websites, code or email design types — Cherry Berry doesn't edit those, and nothing may lead to an unbuilt feature.
- No stock photos (licensing and size); starter content is vector-only.
- No new document features beyond what the toolbar needs: no italic/underline/strikethrough, lists, effects, animation, crop. The toolbar exposes what the `.cherry` model already has.
- Bundling images and fonts into exported `.cherry` files is out of scope (import shows a placeholder for a missing image).

## Constraints

- Palette `#8E1EA2` berry, `#C654C3` orchid, `#ED96D7` blush, `#FFC0DE` petal, via `theme.css` tokens; text contrast ≥ 4.5:1; Space Grotesk headings, Inter body.
- Everything the e2e suites cover keeps working; accessible names change only where a task says so, with the tests changed in the same commit.
- Keyboard: every toolbar control, popover, panel and the Create dialog are reachable and closable by keyboard (Escape returns focus to the opener). Editor single-key shortcuts keep working.
- Viewer role: everything that edits stays disabled exactly as today.
- Interactive targets ≥ 44px on app pages, ≥ 34px for compact editor controls; visible focus ring.
- New dependencies only via `pnpm add`; fonts must be OFL and come from `@fontsource/*` (the server export already loads Inter and Space Grotesk that way).

## Decisions (Claude's calls)

### 1. Starter content ships with the app

- **Built-in templates:** about 24 `.cherry` documents authored in the repo (`packages/doc/starter/` or similar), covering every Create-dialog category (social posts and stories, presentations, A4/Letter flyers and posters, business cards, invitations/cards). Vector-only: text, rects, ellipses, paths, plus shapes from the existing built-in shape catalogue (blobs, sparkles, badges, doodles). Each uses the palette or a small set of tasteful accent palettes, and at least two fonts.
- They are **not** rows in the `templates` table (that table needs a workspace and an author). The server reads them from the bundled files and lists them alongside public templates, marked "Built-in"; "Use template" creates a design from the document exactly like a public template. License CC0, no attribution.
- Instance admins can't delete built-ins in this round (they're part of the app, like the shape catalogue).
- Thumbnails are rendered once (build time or first request, builder's choice) with the existing export renderer.

### 2. More fonts

- Add about 10 OFL families from `@fontsource`: a mix of sans (e.g. Poppins, Montserrat, DM Sans), serif (Playfair Display, Lora), display (Bebas Neue, Abril Fatface), script (Dancing Script, Pacifico) and mono (JetBrains Mono). Exact list is the builder's, keeping weights to 400 and 700 where the family has them.
- Registered on the web (font picker, canvas) and in the server export renderer the same way Inter is today, so an export matches the canvas.
- The font picker shows each family in its own face, built-ins first, then the brand kit's fonts.

### 3. Home

- **Hero:** a short berry→orchid gradient band (not a big empty card) with a title in Cherry Berry's own voice ("What are you making today?"), one search box that searches the user's designs *and* templates (results grouped), and one row of round coloured format shortcuts: Social post, Story, Presentation, Flyer, Poster, Business card, Invitation, Custom size, Open file. Each opens the Create dialog on that category (Custom size and Open file go straight to their panes).
- **Continue designing:** a grid of large previews (real page render via the existing preview, light grey tile, no pink frame), title, size and "edited …" under each, ⋯ menu for rename/duplicate/delete as today. "See all" opens the full list with search and sort.
- **Start from a template:** a horizontally scrolling row of built-in and public templates; "See all" → Templates.
- **Browse by category:** coloured category cards (Social, Presentations, Print, Cards & invites) linking to filtered Templates.
- **First run:** with no designs, "Continue designing" is replaced by a short welcome line and the template row moves up.
- Removed: the duplicate "New design" button and the workspace/role tag in the hero (the sidebar already shows both). Fixed: the detached search icon.
- **Phone:** one header with the workspace switcher and one avatar; shortcuts as one horizontally scrolling row; no duplicate size rows; the floating + button opens the Create dialog.

### 4. Create a design dialog

- A modal over the current page (route `/new` keeps working and opens it over Home).
- Left: categories — For you, Social media, Presentations, Print, Cards & invites, Custom size, Open a .cherry file. Top: a search box filtering all sizes by name.
- Right: size cards with a proportional generic preview, name and dimensions. "For you" shows recently used sizes and popular ones.
- Sizes (builder may adjust values to current platform norms): Instagram post 1080×1350 px, Square post 1080×1080 px, Story 1080×1920 px, Facebook post 1200×630 px, Facebook cover 1640×624 px, LinkedIn post 1200×627 px, X post 1600×900 px, YouTube thumbnail 1280×720 px, Pinterest pin 1000×1500 px; Presentation 16:9 1920×1080 px, Presentation 4:3 1024×768 px; A4 portrait/landscape, A5, US Letter, A3 poster, 18×24 in poster (all CMYK, 3 mm bleed); Business card 85×55 mm, Invitation 5×7 in, Postcard 6×4 in, Greeting card 5×7 in (CMYK).
- Custom size keeps today's form (title, width, height, unit, colour mode).
- **Open a .cherry file:** pick a file → `parseCherry` → on success a new design with that content in the current workspace; on failure the parser's error in plain words. Images whose asset isn't in this instance render as a grey placeholder with a "missing image" label (export keeps the existing placeholder behaviour).

### 5. Editor layout

- **Top bar:** back to Home, File menu (Rename, Page size and colour mode, History, Publish as template, Open a .cherry file, Export), undo/redo, save state, title (click to rename), presence avatars, Share, and **Export** as the primary button. Today's History/Export/Share/Publish buttons move into this structure.
- **Left rail + one panel:** rail items Templates, Elements, Text, Uploads, Brand, Draw, Layers; clicking one opens its wide panel (≈320px), clicking it again or the collapse handle closes it. The panel holds content, not settings:
  - *Templates:* the template browser; using one adds its pages after the current page (never overwrites).
  - *Elements:* today's Shapes panel content (basic shapes, lines, built-in catalogue, my/workspace/public shapes, Import SVG) plus visuals of type SVG.
  - *Text:* "Add a heading / subheading / body text" presets sized relative to the page (heading ≈ 8% of page height, subheading ≈ 4.5%, body ≈ 2.5%), the brand kit's fonts and colours if the design is linked to one, and font pairing combinations from the new fonts.
  - *Uploads:* today's Visuals panel (upload, mine/workspace/public, images/GIFs/SVG, tags).
  - *Brand:* today's Brand panel.
  - *Draw:* the pen tool and path tools (today's toolbar pen + PathPanel).
  - *Layers:* today's Layers list.
- The select/text/pen tool buttons disappear as a separate column; select is the default, text is added from the Text panel or the `T` key, the pen from Draw or `P`. All single-key shortcuts stay.
- **Context toolbar** (a bar above the canvas, contents depend on the selection):
  - Text: font picker, size with −/+, colour, bold (weight 400↔700, or the nearest weights the font has), alignment, spacing popover (line height, letter spacing), opacity, Position.
  - Rect/ellipse/path: fill, stroke colour and width, corner radius (rect), opacity, Position; "Edit points" for paths.
  - Image: opacity, Position.
  - Group / several: Group/Ungroup, align and distribute, opacity, Position.
  - Nothing selected: page background colour, page size, colour mode.
  - Always at the end: Brand lock (when a kit applies) and Lock.
- **Position popover** holds what the right panel holds today: X/Y/W/H, rotation, align to page, arrange (bring forward/back). The permanent right-hand properties panel is removed; the canvas gets that width.
- **Selection mini-menu:** a small floating menu just above the selection — Duplicate, Delete, Lock, and a ⋯ with layer order, Group/Ungroup, Copy/Paste.
- **Colour picker popover:** document colours, brand kit colours, palette, then a custom picker with hex — replacing today's plain hex field.
- **Canvas:** a page header strip above the page with the page name (editable, uses `Page.name`) and page actions (move up/down, duplicate, delete, add page). The editor still shows one page at a time.
- **Bottom bar:** page strip of thumbnails (click to switch, + to add), zoom slider with percentage, Fit, and a grid view of all pages for reordering.
- New text defaults: inserted centred on the visible page area at the preset size above, box width fitted to the text (not 60% of the page).
- **Phone editor:** the rail becomes a bottom bar; panels open as bottom sheets (the existing `Sheet`); the context toolbar becomes a horizontally scrolling row above the bottom bar.

### 6. Library, Shapes, Templates and Brand pages

- Same visual system as the editor panels: one row of compact filter chips (type · source · license as dropdown chips instead of three full pill rows), large thumbnail grids, a details drawer only when something is selected.
- Templates page: built-ins included, grouped by category with "See all" per category when unfiltered.
- Empty states say what to do and offer the action (e.g. Brand kits: what a kit is, "Create a brand kit", "Import kit"; Library: "Upload your first image" plus a drop zone).
- Shapes page: shows the full built-in catalogue (today the page shows only six basic shapes while the editor has blobs, sparkles, badges and doodles).

### 7. Answers to the builder check (Claude's calls)

- **Templates of another size in the editor:** the Templates panel lists templates that fit the current page (same unit and aspect ratio within 2%) first, under "Fits this page", and the rest under "Other sizes". Inserted pages always keep their own width, height, unit, colour mode and bleed (the model already stores these per page); nothing is rescaled. The page strip, zoom-to-fit and export already work per page and must be checked with mixed sizes.
- **"Open a .cherry file" in the editor's File menu** always creates a new design (it opens the Create dialog on that pane). It never replaces the open design.
- **"For you" in the Create dialog:** recently used sizes are kept in `localStorage` per browser (last 6, guarded with try/catch); "popular" is a fixed list (Instagram post, Story, Presentation 16:9, A4 portrait, Business card). No server change.
- **Where every control of today's right-hand Properties panel goes** (none is dropped):
  - X/Y/W/H, rotation, align to page, distribute H/V → Position popover (distribute appears when several are selected).
  - Fill, stroke, stroke width, corner radius, opacity, font, size, weight, line height, letter spacing, text align → context toolbar (spacing in its popover).
  - Combine (union/subtract/intersect/exclude) and Convert to path → context toolbar for shapes and multi-selections, and in the selection mini-menu's ⋯.
  - Brand lock → toolbar end; the design's brand-kit link (today's "Brand kit" select under Page) → the Brand panel and the nothing-selected toolbar.
  - Image details (title, license, attribution) → an "Info" button in the image toolbar opening a popover.
  - Delete → mini-menu and the Delete key.
  - Path point editing stays in the Draw panel / "Edit points" mode as today.
- **Starter content size:** at least 16 templates (at least 3 per category: social, presentations, print, cards & invites), target 24. Authoring is its own task(s), after the editor work.
- **Colour picker:** no new dependency. The popover is swatches (document, brand kit, palette) plus the native `<input type="color">` and a hex field.

## Left to the builder

- Exact sizes, spacing and component styling within the constraints; icon drawings (inline SVG like today).
- The exact font list (within the families and roles above) and the 24 template designs.
- How built-in templates are stored, listed and thumbnailed, as long as they appear wherever templates do and need no database rows.
- Whether the home search is server-side or client-side.
- Task order and how to split the work into tasks; which existing e2e specs need new selectors.
