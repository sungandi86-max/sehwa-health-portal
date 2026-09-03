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

Use the existing app font stack. Headings use strong weight and tight tracking, body copy uses medium weight and comfortable Korean line-height.

## 4. Spacing And Shape

Firebase v2 surfaces use mobile-first cards with 24-32px radius, 4px-based spacing, and central desktop content width around `max-w-5xl`.

## 5. Components

- Page shell: soft mint page background, large white header card, compact term/user panel.
- Data card: white card, rounded 24-30px, subtle border, soft shadow.
- Status pill: rounded full, small bold text, mint/blue/error semantic tones.
- Action card: entire card is clickable when it navigates; focus rings use mint.
- Disabled action: same shape as action card but lower opacity and no navigation.

## 6. Motion

Interactive cards and buttons may lift by 1px on hover/focus. Avoid decorative motion.

## 7. Accessibility

Use semantic links for navigation, buttons for actions, visible focus rings, and concise Korean labels. Do not expose raw developer errors or student-sensitive data in general dashboard surfaces.
