# Stitch Design — Dogfight (Modern Military HUD)

UI/screen design for the game, generated with **Google Stitch** (MCP) and seeded
from the existing client code. Aesthetic: dark navy tactical avionics HUD,
glowing cyan `#3399FF`, Space Grotesk + Space Mono, sharp corners, HUD status
colors (green/amber/red).

## Stitch project (persists in your Stitch account)
- **Project**: `Dogfight — Multiplayer Flight Combat` → `projects/15721247837529630371`
- **Design system**: `Dogfight HUD — Modern Military` → `assets/17176895595555118563`
- View/edit in the Stitch web app (sign in with the same Google account that owns
  the API key). All generated screens live there even if not retrieved here.

## Design system (see `DESIGN.md`)
- colorMode `DARK`, primary `#3399FF`, variant `VIBRANT`
- headline/body **Space Grotesk**, labels/data **Space Mono**, roundness `ROUND_FOUR`
- Tokens captured in generated HTML:
  `bg-base #070B12 · bg-panel #0C1320 · bg-raised #111A2B · primary #3399FF ·
   primary-bright #66CCFF · ok #4CAF50 · caution #FFC107 · danger #F44336 ·
   text #E6F1FF / #8FA9C8 / #5A7290`

## Screens (all retrieved ✅)
| Screen | Stitch screen id | Files |
|---|---|---|
| Entry / login (`게임 입장`) | `74d841d742994e05807c3dd95e5e1f9f` | `stitch-login.html` · `stitch-login.png` |
| In-game HUD (`Tactical HUD Overlay`) | `cc585d1860fa46ba950ab2b43e6b5ff3` | `stitch-hud.html` · `stitch-hud.png` |
| Main menu / title | `e72749521ff04889a76aea20ee6af766` | `stitch-menu.html` · `stitch-menu.png` |
| Game over (`격추됨`) | `293601a18b084abb88bf2712435437b6` | `stitch-gameover.html` · `stitch-gameover.png` |

Each `.html` is a standalone Stitch export (Tailwind CDN + Google Fonts, design
tokens inlined). `get_screen` retrieves any of them by id (projectId + screenId).

## Generating more screens (the 60s cap + how it was beaten)
Stitch's MCP tools only load into Claude Code at session start; this session added
the server afterward, so it was driven directly over HTTP. That works for fast
calls and for any generation that finishes in **under ~60s** — the Google Front End
**caps the unary HTTP response at ~60s** and resets the connection before a longer
result returns (`curl: (16) HTTP2 framing layer` at t≈60.2s). Screens still persist
server-side, but `list_screens` returns empty for this API key, so dropped screens'
ids can't be enumerated to fetch via `get_screen`.

**Workaround that worked:** keep prompts lean (fewer elements → less output → faster),
prefer `modelId: GEMINI_3_FLASH`, and **retry** until an attempt lands < 60s
(`/tmp/stitch_retry.sh`). All four screens were captured this way (42–57s each).

**Cleaner long-term:** restart Claude Code so the native Stitch MCP tools load, or
open the project in the Stitch web app to edit/export. Helper scripts used here:
`/tmp/stitch_call.py`, `/tmp/stitch_gen.sh`, `/tmp/stitch_extract.py`, `/tmp/stitch_retry.sh`.

## Prompts used (for regeneration)
- Entry, Menu, HUD, Game-over prompts are saved at `/tmp/stitch_args_*.json` and
  reproduced in the project history. All use `deviceType: DESKTOP`,
  `designSystem: assets/17176895595555118563`.
