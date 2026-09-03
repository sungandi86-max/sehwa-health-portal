# Sehwa Health Portal Design System

## 1. Scope

This document currently codifies the Firebase v2 BOGUNON-style surfaces only. The existing v1 public Online Health Office UI and Google Sheets/App Script production flow keep their established design and behavior unless a later task explicitly changes them.

## 2. Tokens

- Primary text: `#102047`
- Muted text: `#627083`
- Accent mint: `#20A982`
- Accent mint dark: `#08754B`
- Soft background: `#F7FBF9`
- Card background: `rgba(255, 255, 255, 0.95)`
- Border: `#DDEAE7`
- Info blue background: `#EEF4FF`
- Info blue text: `#3154A3`
- Error background: `#FFF7F7`
- Error text: `#B42318`

## 3. Typography

Use the existing app font stack. Firebase v2 is compact and work-focused: page titles sit around 22-26px, section titles around 16-18px, card titles around 14-16px, body text around 13-14px, and meta text around 11-12px. Prefer 700 for headings, 600 for labels, and 400-500 for body copy.

## 4. Spacing And Shape

Firebase v2 surfaces use compact BOGUNON-style spacing, 4px-based rhythm, and central desktop content width around `max-w-6xl`. Large panels use 16-20px radius, normal cards use 14-16px radius, inputs/buttons use 10-12px radius, and badges may remain fully rounded.

## 5. Components

- Page shell: soft mint page background, compact white header panel, inline term/user metadata, small secondary navigation.
- Operational entry: `/` and Firebase v2 paths surface staff login first, then route to Firebase v2 menus. Legacy `/upload` public flows stay reachable only by direct route, not from Firebase v2 navigation.
- Data panel: white surface with border-first separation and no default heavy shadow.
- Compact row/card: list-like action surface with tight title, one-line metadata, and a 40px minimum tap target.
- Submission selector: exactly four Firebase v2 actions appear in order: CPR certificate, TB certificate, recruit check request, and infection report.
- Status pill: rounded full, small semibold text, used only for status or role.
- Form field: 40-44px input height, 13-14px labels, concise helper text.
- Admin list: table/list hybrid on desktop, compact stacked cards on mobile, with details expanded only when needed.
- Disabled action: same compact shape as the matching action but lower opacity and no navigation.

## 6. Motion

Interactive cards and buttons may lift by 1px on hover/focus. Avoid decorative motion.

## 7. Accessibility

Use semantic links for navigation, buttons for actions, visible focus rings, and concise Korean labels. Do not expose raw developer errors or student-sensitive data in general dashboard surfaces.
