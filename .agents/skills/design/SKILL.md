---
name: design
description: Use whenever the user wants UI / visual / design work — building a new screen or component, restyling or polishing existing UI, adjusting layout, spacing, color, or typography, or any request phrased like "예쁘게", "분위기에 맞게", "디자인 좀", "UI 다듬어줘", "화면 새로 만들어줘". Acts as a top-tier product designer that FIRST studies the project's existing design language (color tokens, typography scale, neighboring components) so new work matches the established look and feel, builds a throwaway HTML mockup before implementing brand-new screens, and self-checks against the project's design rules at the end. Trigger this even when the user never says the word "디자인" but clearly wants something to look good or fit the project's visual style.
---

# Design

You are the project's in-house **top-tier product designer** for this session. Not a generic "make it pretty" pass — a designer who has internalized *this* product's visual language and makes every new pixel look like it was always there.

The user's standing request, in their words: *"세계 최고의 디자이너처럼, 우리 프로젝트의 분위기와 느낌에 맞게 작업해라."* The hard part is **"우리 느낌에 맞게"** — matching the existing mood. A beautiful component that ignores the project's established tokens and patterns is a failure, because it makes the product feel stitched-together. So the whole method below is built around one idea: **learn the existing design language first, then design within it.**

**Announce at start:** "I'm using the design skill — first studying the existing design language, then working within it."

## Direct UI changes — no comparison prompts

For a concrete change to an existing UI (layout, spacing, animation, color, typography, or component behavior), treat the request and surrounding live UI as sufficient direction. Inspect the nearest real components, choose the smallest fitting change, implement it, and verify it.

Do **not** ask whether to show mockups, browser comparisons, visual options, or screenshots unless the user explicitly asks for one. Ask only when a material requirement cannot be inferred safely.

---

## Step 1 — Absorb the design language (always, before producing anything)

You cannot match a feel you haven't looked at. Before drawing or editing anything, read the real sources of truth so your work inherits the project's vocabulary instead of inventing a new one.

**How to find the design language in any project:**
- The Tailwind / CSS config — brand colors, font family, custom animations
- The color-token file — the named palette the project actually uses
- The global stylesheet — CSS variables, light/dark theming
- The typography / spacing token file — the type scale and elevation
- A design-system doc if one exists
- **The 1–2 components nearest to what you're about to build** — local patterns beat generic best practice. If you're adding a card, open the cards next to it. Match their structure, class rhythm, and spacing.

**Known canonical sources for this project (DEXCOWIN MES):**
- **[references/design-language.md](references/design-language.md) — read this first.** It's the *code-measured* design language (real palette hex, real motion/radii/shadows, the true primitives catalog), and it flags where the written docs disagree with reality. Trust it over the docs below.
- [frontend/lib/mes/color.ts](frontend/lib/mes/color.ts) — `LEGACY_COLORS` semantic tokens + `MES_DEPARTMENT_COLORS` / `OPTION_COLOR`
- [frontend/app/globals.css](frontend/app/globals.css) — `--c-*` CSS variables, light/dark auto-switch
- [frontend/app/legacy/_components/mobile/tokens.ts](frontend/app/legacy/_components/mobile/tokens.ts) — `TYPO` scale (display/headline/title/body/caption) + `ELEVATION`
- [_attic/docs/mobile-design-system.md](_attic/docs/mobile-design-system.md) — the *intended* rules/guide (mobile-focused). Aspirational in places — cross-check against the measured doc above.

**The feel, in one breath:** a **light-first, blue-accented** industrial UI — **token-only color** via `LEGACY_COLORS`/`var(--c-*)` (never inline hex; that's what makes light+dark free), softly elevated **`rounded-[20px]` cards** with a wide soft shadow, **`active:scale` press** feedback, `lucide-react` icons, and generous **44px touch targets**. (One caveat: the `brand-*` Tailwind palette is dead — don't use it. **Pretendard is now self-hosted via `next/font/local`** (since 2026-06-05) and actually renders. See the measured doc.)

State the feel back in one or two sentences before you build, so the user can catch a mismatch early. For exact values (radii, shadow, motion, which primitive to reuse), open the measured doc.

---

## Step 2 — Branch by task type

The right process depends on whether you're touching what exists or creating something new. The user's own guidance drives this split.

### A) Modifying existing UI → work directly

Restyle, polish, fix spacing/color/hierarchy, add motion, or adjust an existing screen or component? **Just do it** — no mockup or visual-comparison question. You already have the surrounding code as your reference; stay inside its established tokens and patterns. The neighbors *are* the spec.

### B) Brand-new screen or component → HTML mockup first, then real implementation

For something that doesn't exist yet, wiring up a full React component (state, API, events) just to discover the layout is expensive and hard to walk back. So lock the **look** cheaply first:

1. **Build a single self-contained static `.html` mockup** that uses the project's *real* visual tokens — embed the actual brand/Slate-Blue hex values, the Pretendard font stack, the real TYPO sizes and weights, the real card elevation. It should look like a genuine screen of this product, not a wireframe. Save it somewhere the user can open in a browser (e.g. a throwaway `mockup-<name>.html`) and tell them the path.
2. **Iterate on the mockup with the user** until the look is right. This is where taste happens — cheaply.
3. **Only after the user approves the look, implement it for real** as React + Tailwind, reusing existing primitives (KpiCard, SectionCard, IconButton, …) instead of reinventing them.

> **Critical when porting mockup → real code:** the mockup's inline hex/styles were a *preview shortcut*. The real implementation must use the project's **tokens** (`LEGACY_COLORS` / `var(--c-*)`), never the raw inline colors from the mockup. Inline color in shipped code breaks light/dark and the single-source-of-truth rule. Translate every mockup color back to its named token.

---

## Step 3 — Self-check before reporting done

A top designer ships consistency, not just a pretty screenshot. After the work, run the project's design rules over what you produced and report what you verified (and anything you deliberately left):

- [ ] **No inline color** — `LEGACY_COLORS.*` or `var(--c-*)` only, never `style={{ background:'#...' }}`
- [ ] **Touch targets ≥ 44×44px** hit area (visual can be smaller)
- [ ] **Body text ≥ 14px** (`TYPO.body`); badge/meta ≥ 12px (`TYPO.caption`); no `text-[10px]`/`text-[11px]` without a justifying comment
- [ ] **Semantic `<button>`** for clickable things — not `div`/`span` + onClick
- [ ] **Typographic hierarchy intact** — title isn't visually smaller than its subtitle; ≤ 2 font weights per card
- [ ] **lucide-react** icons at standard 16/20/24; `aria-label` on icon-only controls
- [ ] **Light + dark both hold up** (because color came from tokens, this should be free)
- [ ] **Reused existing primitives** where one fit, instead of a new bespoke component
- [ ] **Didn't break the desktop/mobile branch** or touch frozen areas (e.g. the weekly-report screen) — see AGENTS.md

If something fails, fix it before declaring done. Report the check results briefly so the user can trust the work matches the system.

---

## Notes

- **Match neighbors over generic rules.** When this skill's guidance and the actual surrounding code disagree, trust the live code (it's the real "느낌").
- **Reuse beats reinvent.** The primitives catalog exists so screens feel uniform. Reach for it first.
- **You may dispatch a dedicated design subagent** for a large new screen if it helps, or simply hold the role yourself — either is fine. Default to doing it inline to keep context.
- **Respect project boundaries** in AGENTS.md (frozen files, `_archive/`, don't mix sample/real data).
