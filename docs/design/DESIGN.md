# Dogfight — Modern Military HUD Design System

A real-time multiplayer **flight-combat (dogfight) FPS**. The UI is a tactical
fighter-jet **heads-up display**: dark, glowing, precise, and built for speed.
Think modern avionics / military targeting computer crossed with a clean
e-sports HUD. Desktop / WebGL, landscape, dense data readouts.

## Mood & keywords
Tactical · avionics · targeting computer · cockpit glass · scanlines · phosphor
glow · precision · high-contrast · cold · fast · aggressive but legible.

## Color
- **Background**: near-black navy. Base `#070B12`, panels `#0C1320`, raised `#111A2B`.
- **Primary / accent (cyan-blue, glowing)**: `#3399FF`. Use for active data, key
  borders, focus rings, the title, primary buttons. Add a soft outer glow
  (`box-shadow: 0 0 12px rgba(51,153,255,.45)`).
- **Primary bright**: `#66CCFF` for hover / emphasis.
- **Status colors (HUD semantics — keep consistent everywhere):**
  - Healthy / Ready / OK → green `#4CAF50`
  - Caution / Reloading / Cooldown → amber `#FFC107`
  - Danger / Empty / Low-health / Damage → red `#F44336`
- **Neutrals / text**: primary text `#E6F1FF`, secondary `#8FA9C8`, muted `#5A7290`.
- **Grid / hairlines**: `rgba(51,153,255,.12)` thin lines for tactical grid + dividers.

## Shape & surfaces
- **Sharp, angular** panels — small 4px radius, prefer **clipped / beveled corners**
  and L-shaped **corner brackets** ( ⌜ ⌝ ⌞ ⌟ ) framing key modules.
- 1px borders in primary at ~30–50% opacity, with faint glow. No heavy drop shadows.
- Glassmorphism allowed sparingly: `backdrop-filter: blur(6px)` over the 3D scene.
- Subtle **scanline** overlay and a **vignette**; optional faint film grain.
- Tactical **grid backdrop** (perspective horizon lines) behind menu screens.

## Typography
- **Headline / titles**: Space Grotesk, heavy, wide letter-spacing, UPPERCASE for
  labels ("DOGFIGHT", "READY", "ELIMINATED").
- **Body**: Space Grotesk.
- **Numeric readouts / labels / data** (speed, altitude, ammo, HP, coords, timers):
  **monospace** (Space Mono) so digits don't jitter. Tabular, uppercase mini-labels
  like `ALT`, `SPD`, `AMMO`, `HP`.

## Components
- **Status panels**: titled module boxes with corner brackets and a thin top accent bar.
- **Bars** (health / reload / ammo): segmented or thin track with glowing fill that
  shifts green→amber→red by value.
- **Crosshair / reticle**: centered, thin cyan ring + ticks + center dot, soft glow,
  gentle pulse.
- **Buttons**: primary = filled cyan with glow; secondary = ghost (cyan outline).
- **Inputs**: dark field, cyan underline/border, glow on focus.
- **Minimap / radar**: circular sweep, blips, range rings (where relevant).

## Layout language
Corner-anchored HUD: vitals bottom-left, weapon/ammo bottom-right, objectives/score
top-center, status/telemetry top-left, radar top/bottom-right. Center stays clear
for the reticle. Generous use of negative space over the live 3D scene.

## Localization
UI labels are Korean (e.g. "게임 입장", "게임 시작", "재장전") with English/mono data
tags. Keep Korean strings rendering in a clean sans fallback; keep numerals mono.
