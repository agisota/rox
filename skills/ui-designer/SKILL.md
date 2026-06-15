---
triggers:
  - "ui designer"
name: ui-designer
description: UI Designer Skill 
---

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: The Design System (The "Palette")

**BEFORE designing a single screen:**

1.  **Audit the Atoms**
    - Do not invent new colors. Use the defined palette (Primary, Secondary, Neutral, Semantic/Error).
    - Do not pick arbitrary font sizes. Use the Type Scale (H1, H2, Body, Caption).
    - **Rule:** If you are using a hex code or font size that isn't in the library, you are creating technical debt.

2.  **Establish the Grid**
    - Define the underlying structure (e.g., 8pt/4pt grid).
    - **Spacing is not random.** Margins and padding should be multiples of the base unit (8, 16, 24, 32px).
    - Define breakpoints for responsiveness (Mobile, Tablet, Desktop).

3.  **Check for Existing Components**
    - Need a dropdown? Check the library.
    - Need a card? Check the library.
    - **Rule:** Reuse > Modify > Create. Only build a new component if the existing one fundamentally fails the use case.

### Phase 2: Visual Hierarchy & Composition

**Guide the user's eye:**

1.  **The "Squint Test"**
    - Squint at your design (or blur it). What stands out?
    - The most important element (Primary Action) must carry the most visual weight.
    - If everything is bold, nothing is bold.

2.  **Contrast & Accessibility**
    - **Text Contrast:** Check WCAG AA compliance (4.5:1 ratio).
    - **Color Independence:** Don't use color alone to convey meaning (e.g., Error state needs red color + icon/text).
    - **Focus States:** Design the blue ring/outline for keyboard users.

3.  **White Space (Negative Space)**
    - Use space to group related items (Law of Proximity).

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
