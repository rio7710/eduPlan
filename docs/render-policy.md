# Render Policy

Use this document as the default rendering policy for `eduFixer`.

## Goal

Keep the UI stable during navigation. Full render is allowed only when the document payload changes or the app enters a fresh render session.

## Core Rule

- Full render only on initial load, document open, document switch, refresh, or content change.
- Navigation-only changes must not trigger full render.

## State Separation

Split state into three categories.

### 1. Content State

- Document content
- Parsed block structure
- Derived render output

Only content state may trigger full or partial render work.

### 2. Navigation State

- Current line
- Current heading
- Location bar trail
- MD menu active item
- Search result target
- Selected preview line

Navigation state updates must not rebuild the full render tree.

### 3. View State

- Scroll position
- Active panel
- Focus owner
- Mode toggle state
- Sidebar width

View state updates must not rebuild the full render tree.

## Full Render Triggers

Allow full render only for:

- App start
- Hard refresh
- Opening a different document
- Replacing the current document content
- Explicit mode entry that requires a fresh render tree

## Partial Render Rules

For all other cases, prefer partial updates.

- Scroll: update location and visible markers only
- Menu navigation: update active item and target line only
- Location change: update badges and breadcrumb only
- Search jump: move selection and scroll target only
- Selection change: update highlight only

## Render Pane Rules

- Do not rebuild the render pane because the current line changed.
- Do not rebuild the render pane because the user scrolled in the editor.
- Do not rebuild the render pane because the MD menu active item changed.
- Do not rebuild the render pane because the location bar changed.
- In render mode, content stays visually stable unless content changes or the user directly interacts with the render surface.

## MD Menu And Location Rule

- When the MD menu is active, its highlighted heading must follow the same heading basis as the location bar.
- When the MD menu is inactive, do not spend render work to keep menu-only state updated.

## Split Mode Rule

- In split mode, the active pane is the navigation source.
- If the user is interacting with `Edit`, location must follow `Edit`.
- If the user is interacting with `Render`, location must follow `Render`.
- The inactive pane is a follower.
- The follower pane may update scroll position, active line, or highlight to match the location basis.
- The follower pane must not trigger full render work just because the active pane moved.
- Split-mode synchronization should prefer location sync over full content sync.

## Implementation Direction

- Keep block identity stable across edits.
- Memoize render blocks by content-derived identity.
- Treat navigation updates as DOM/scroll/highlight work, not content render work.
- Route location updates through lightweight state.
- Route content updates through render state.

## Anti-Patterns

Avoid these patterns:

- Re-rendering the whole preview because `currentLine` changed
- Re-rendering the whole preview because `navigateToDocumentLine` ran
- Re-rendering the whole preview because a panel opened or closed
- Sharing one state path for both content updates and navigation updates

## Review Checklist

Before merging render-related changes, verify:

- Does this change rebuild render output when only location changed?
- Does editor scroll move the render pane unnecessarily?
- Does menu activation force preview work when the menu is hidden?
- Is the change using content state for a navigation-only update?
