# Sehwa Health Portal Design System

## 1. Purpose

Sehwa Health Portal is a calm, practical school-health operations portal. It is not a marketing site, an AI SaaS landing page, or a decorative dashboard. Design work must make real school health office tasks easier to scan, decide, and complete.

The preferred atmosphere is quiet and work-focused: white surfaces, a soft mint canvas, deep navy text, compact Korean typography, restrained status color, and dense but orderly information. Explanations support work; they do not replace work.

## 2. Scope And Protection

This document applies first to Firebase v2 and newly built operational surfaces. The existing v1 public Online Health Office, Google Sheets, Apps Script, and legacy submission flows keep their current design and behavior unless a future task explicitly requests a redesign.

Design changes must not silently change product structure. In particular, design work does not change menu count, menu names, routes, permissions, data models, or operational information architecture.

The home menu remains exactly these eight areas unless a product task says otherwise:

1. 오늘의 보건실
2. 제출·보고 센터
3. 검진·검사 안내
4. 교육 자료실
5. 담임 협조 요청
6. 학생 건강관리 확인
7. 건강정보/이벤트
8. FAQ

## 3. Color System

Use color as an operational hierarchy, not decoration.

| Role | Preferred Use |
|---|---|
| Canvas | Soft mint or near-white app background |
| Surface | White panels, lists, forms, drawers, and grouped controls |
| Text | Deep navy primary text, slate secondary text, muted meta text |
| Border | Quiet dividers, input outlines, card boundaries, table rows |
| Action | Mint for primary interaction, selected state, and focus emphasis |
| Status | Restrained success, warning, danger, and info tones |

Current core tokens:

- Primary text: `#102047`
- Muted text: `#627083`
- Accent mint: `#20A982`
- Accent mint dark: `#08754B`
- App background: `#F8FAFA`
- Muted surface: `#F3F8F6`
- Surface: `#FFFFFF` or `rgba(255, 255, 255, 0.95)`
- Border: `#DDEAE7`
- Info background: `#EEF4FF`
- Info text: `#3154A3`
- Error background: `#FFF7F7`
- Error text: `#B42318`

Accent color is for interaction, selection, focus, and meaningful status. Do not add decorative gradients, radial glows, color blobs, confetti palettes, or ornamental accent fields. New colors need a named purpose before they are introduced.

## 4. Typography

Use Pretendard first, then Korean system fallbacks. Korean copy should feel compact and official without becoming cramped.

Recommended scale:

| Role | Size | Weight | Notes |
|---|---:|---:|---|
| Page title | 22-26px | 700 | One clear title per page |
| Section title | 16-18px | 600-700 | Use for real content groups |
| Card/action title | 14-15px | 600 | Keep action entries compact |
| Body | 13-14px | 400-500 | Default operational copy |
| Supporting/meta | 11-12px | 400-500 | Dates, labels, helper text |
| Header navigation | 12-13px | 500-600 | Compact, stable, not promotional |

Use `font-variant-numeric: tabular-nums` for summary counts, dates, and aligned numeric lists when comparison matters.

Typography anti-patterns:

- Repeating 30px or larger headings across normal app screens
- Using `font-black`, 800, or extra-heavy weights for every heading
- Giving every card a large heading
- Emphasizing long explanatory paragraphs
- Scaling font size with viewport width
- Using negative letter spacing in Korean UI

## 5. Information Density

Operational information comes first. A user should quickly see what exists, what needs action, and where to go next.

Rules:

- Keep hero areas minimal or absent in task screens.
- Limit explanatory copy to one or two short lines.
- Prefer showing more actual work items per screen over large empty space.
- Do not place cards inside cards.
- Use rows, lists, and tables for repeated data before using large cards.
- Desktop administrator screens should favor dense list/table hybrids.
- Mobile screens may use compact cards for readability and touch targets.
- One screen can be calm and still information-rich.

## 6. Spacing, Layout, And Shape

Use a consistent 4px-based rhythm. Spacing should clarify grouping without making the interface feel sparse.

Recommended spacing:

- Tight inline gap: 4-6px
- Related controls: 8px
- Card/list padding: 12-16px
- Section gap: 20-28px
- Page top/bottom rhythm: 24-40px, depending on screen density

Recommended control sizing:

- Desktop controls: 36-40px high
- Mobile touch targets: at least 44px high
- Form labels: 13-14px with short helper text only when useful

Recommended radius:

- Small controls: 8-10px
- Normal cards and panels: 10-14px
- Drawers and modals: 14-18px
- Full pills: only for compact toggles, status, or role badges

Page-level horizontal scroll is never acceptable at 390px or 1440px. Overflow may live inside a specific control, such as a segmented filter, but the page itself must remain stable.

## 7. Depth And Surface

Hierarchy should be border-first. Use surface tone, border, spacing, and typography before shadow.

Default surfaces:

- White or near-white background
- Quiet border
- No shadow, or a very weak shadow only when separation is otherwise unclear
- Padding 12-16px for cards and compact panels

Reusable primitives:

- `.bogunon-page`: near-white operational canvas using the shared background token
- `.bogunon-panel`: white 12px bordered panel with a very weak shadow
- `.bogunon-panel-muted`: 10px muted surface for grouped controls or inline notes
- `.bogunon-chip`: compact 8px rectangular chip for low-emphasis status or metadata

Reserve elevation for drawers, modals, menus, and focused overlays. Do not make every section a floating SaaS-style card. Do not use 20-30px rounded floating cards as the default visual language.

## 8. Cards

Cards are for necessary grouping, not the default unit of layout.

Use cards for:

- A single submission action
- A compact dashboard metric group
- A repeated item on mobile
- A modal/drawer content block
- A bounded form group

Avoid:

- Turning every page section into a card
- Card inside card structures
- Large floating promotional cards
- Heavy shadows on every card
- A CTA button on every card when the item is informational
- Overly rounded cards that make an operations page feel toy-like

## 9. Buttons And Controls

Button hierarchy:

| Variant | Style | Use |
|---|---|---|
| Primary | Mint fill | Submit, save, approve, main page action |
| Secondary | White surface with border | Alternative action, navigation, view details |
| Ghost | Transparent or text-only | Low-emphasis tools and inline actions |
| Danger | Restrained red | Reject, delete, destructive confirmation |

Large full-width CTAs are for real primary actions such as submit, save, approve, or request access. Navigation lists and dashboard entries should stay compact.

Every button needs a clear label or accessible name. Disabled and loading states must be visible and must prevent duplicate submission.

## 10. Badges

Badges are informational, not decorative.

Use badges for:

- Status
- Role
- Short operational context
- A selected filter state when text also communicates the state

Do not use badges for:

- Email addresses
- Every metadata field
- School year or semester by default
- Decorative color accents
- Information that needs to be read as a sentence

Status meaning must be communicated with text, not color alone.

## 11. Login And Permission UI

Login screens should feel like an internal school work app.

Before login:

- Show Microsoft Teams and Google options.
- Keep the explanation short.
- Prefer Teams as the primary action when appropriate, with Google as a normal secondary login option.
- Avoid Firebase jargon.

After login:

- Show only the useful identity and permission context: name, role, term, and necessary action.
- Keep UID, document IDs, raw provider data, and developer metadata hidden by default.
- Permission errors must name the cause plainly without exposing raw internal errors.

Provider never determines authority by itself. Firebase Auth identifies the user; `user_assignments` determines role and term access.

## 12. Submission And Admin Screens

The Firebase v2 Submission and Report Center keeps exactly four operational actions:

1. 심폐소생술 이수증 제출
2. 결핵검진 확인증 제출
3. 채용검진 대체 인정 확인 요청
4. 감염병 발생 보고

These entries should look like compact operational tasks, not promotional cards.

Administrator screens should use table/list hybrids:

- Compact summary metrics
- Filter and search controls near the list
- Rows on desktop when repeated data is dense
- Compact cards on mobile
- Details in expand areas, drawers, or focused panels
- No oversized card per user or per submission on desktop

File links should appear only when a valid file URL exists. Empty `href` values are not allowed.

## 13. Student Privacy

Student health information is sensitive. The UI must preserve least-necessary visibility.

Rules:

- Do not show student health details on general dashboard surfaces.
- Do not place student names, diseases, IDs, or notes in URL query strings.
- Do not log full student health documents to the browser console.
- Homeroom teachers see only their assigned class scope.
- General staff see only the minimum non-sensitive information needed for their work.
- Health teachers and administrators may see broader information only in administrator or role-protected screens.
- Privacy warnings should be concise, visible, and serious; they should not become oversized decorative callouts.

Do not add new student personal fields without an explicit product and security requirement.

## 14. Motion And Interaction

Motion should confirm interaction, not entertain.

- Micro interactions: 120ms ease-out.
- Panel, drawer, and tab transitions: about 200ms.
- Animate only transform and opacity.
- Avoid decorative animation, bouncing, parallax, or gradient motion.
- Respect reduced-motion preferences where implemented.

Hover lift may be at most subtle. Layout dimensions should not animate in ways that move dense data unexpectedly.

## 15. Responsive Rules

Reference widths:

- Mobile: 390px
- Desktop: 1440px

Desktop priorities:

- Information density
- Fast comparison
- Stable lists and tables
- Compact filters and summaries
- Limited max-width so content does not sprawl

Mobile priorities:

- Touch target safety
- Readable line lengths
- Compact cards or stacked rows
- No clipped labels
- No page-level horizontal overflow

Fixed-format UI elements such as boards, filters, counters, and toolbar buttons need stable dimensions so hover, loading, and dynamic text do not shift the layout.

## 16. Anti-AI UI Checklist

Avoid these patterns:

- Oversized hero sections on task screens
- Repeated huge titles
- Card inside card
- Making every element `round-xl`
- Adding shadow to every card
- Gradients, blobs, or decorative color fields
- Decorative icon boxes on every row
- Turning every metadata item into a badge
- Long explanatory paragraphs before the user can act
- Oversized CTAs for ordinary navigation
- Treating empty space as the design

Prefer these patterns:

- Compact Korean typography
- Quiet borders
- Rows, lists, and tables
- Restrained icons used only when they clarify action
- Task-first content
- Direct labels
- Real work data above explanation

## 17. Accessibility And Error States

Use semantic links for navigation and buttons for actions. Provide visible focus states. Keep labels concise and understandable in Korean.

Every data surface needs distinct states:

- Loading
- Empty
- Permission denied
- Network or server error
- Saving or pending action
- Success

Do not hide permission errors as empty states. Do not expose raw Firebase, token, document ID, or server stack details to ordinary users.
