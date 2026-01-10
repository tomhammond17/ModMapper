# Modbus Document Converter - Design Guidelines

## Design Approach

**Reference-Based Approach**: Drawing inspiration from Convertio and CloudConvert's clean, conversion-focused interfaces. These applications excel at guiding users through upload → process → download workflows with minimal friction and maximum clarity.

**Core Principle**: Professional industrial aesthetic prioritizing utility and clarity over decorative elements. Every component serves the conversion workflow.

---

## Typography System

**Font Families**:
- **Primary**: IBM Plex Sans (headings, UI elements)
- **Secondary**: Roboto (body text, labels)
- **Monospace**: Roboto Mono (register addresses, data types, code)

**Type Scale**:
- Hero/H1: 32px, semibold
- H2 (Section headers): 24px, semibold  
- H3 (Subsections): 18px, medium
- Body: 16px, regular
- Small/Labels: 14px, regular
- Tiny/Captions: 12px, regular

---

## Layout & Spacing System

**Spacing Units**: Use multiples of 16px (1rem, 1.5rem, 2rem, 3rem, 4rem) for consistent rhythm

**Container Strategy**:
- Max-width: 1200px for main content
- Section padding: 64px (desktop), 32px (mobile)
- Component spacing: 16px base unit

**Grid Structure**:
- Single column centered layout for conversion workflow
- Two-column for results table (desktop only)
- 16px gap between components

---

## Color Application

**Primary #2C5F9E (Industrial Blue)**:
- Primary action buttons (Convert, Extract, Parse)
- Active states and selections
- Key icons and badges
- Progress indicators

**Secondary #F39C12 (Warning Orange)**:
- Warning states (file size limits, errors)
- Important alerts
- Validation messages
- "Processing" status indicators

**Background #ECEFF1 (Light Grey)**:
- Page background
- Card backgrounds (slightly lighter: #F5F7F9)
- Disabled states (with reduced opacity)

**Text #263238 (Dark Slate)**:
- Primary text content
- Headings and labels
- Table data

**Success #27AE60 (Green)**:
- Success messages
- Completed conversions
- Valid file uploads
- Download ready states

**Accent #546E7A (Blue Grey)**:
- Secondary buttons (Cancel, Add Row)
- Table borders and dividers
- Input borders (default state)
- Supporting icons

---

## Core Components

### 1. Upload Zone
**Large drag-and-drop area** (600px × 400px minimum):
- Dashed border (3px, #546E7A) with 12px corner radius
- Centered upload icon (48px, #546E7A)
- "Drag & drop files or click to browse" text
- Supported formats text (CSV, XML, JSON, PDF)
- On drag-over: Border → #2C5F9E, background tint #2C5F9E10
- File selected state: Green checkmark icon, filename display, file size

### 2. Format Selector
**Horizontal button group** for output format selection:
- Three options: CSV, XML, JSON
- Radio-style selection with visual feedback
- Selected state: #2C5F9E background, white text
- Unselected: White background, #546E7A border, #263238 text
- 8px border radius per button, 0px gap between buttons

### 3. Conversion Controls
**Action button bar**:
- Primary "Convert" button: #2C5F9E, white text, 44px height, 16px padding
- Secondary "Clear" button: #546E7A outline, same dimensions
- Progress indicator during conversion: Linear progress bar, #2C5F9E on #ECEFF1
- Status text below: "Processing..." (#F39C12), "Complete!" (#27AE60)

### 4. Preview Panel
**Split-panel table view** (before/after conversion):
- Left: Source format preview (first 50 rows)
- Right: Target format preview (first 50 rows)
- Fixed header row with column labels (Roboto Mono, 12px)
- Alternating row backgrounds (#FFFFFF, #F5F7F9)
- 1px borders (#546E7A20)
- Editable cells for manual corrections (click to edit, inline input)
- Add/remove row controls (+ and × icons, 16px, #546E7A)

### 5. Data Table
**Professional register display**:
- 5 columns: Address (80px), Name (180px), Data Type (120px), Description (flexible), Writable (100px)
- Header: #F5F7F9 background, uppercase 11px labels, semibold
- Rows: 48px height, 12px vertical padding
- Hover state: #2C5F9E05 background
- Editable cells: Click to activate inline editing, #2C5F9E border when focused
- Monospace for Address and Data Type columns (Roboto Mono)

### 6. Download Section
**Prominent download controls**:
- Two download buttons side-by-side: "Download CSV" (#27AE60), "Download JSON" (#2C5F9E)
- File info card: filename, size, record count, format badge
- Copy-to-clipboard icon button for quick data access

### 7. Status Messages
**Toast notifications** (top-right corner):
- Success: #27AE60 background, white text, checkmark icon
- Error: #F39C12 background, white text, alert icon
- Info: #2C5F9E background, white text, info icon
- 4px border radius, 16px padding, 300ms slide-in animation
- Auto-dismiss after 4 seconds

---

## Interaction Patterns

### File Upload Flow
1. Drag-over state: Visual feedback (border color change, subtle background tint)
2. File selected: Show filename, size, format badge
3. Validation: Instant feedback for invalid formats
4. Processing: Disable controls, show spinner + progress bar
5. Complete: Enable download, show success message

### Table Editing
- Click cell to enter edit mode
- Tab/Enter to move to next cell
- Escape to cancel edit
- Auto-save on blur
- Visual indicator for modified cells (#F39C1220 background)

### Validation
- Real-time validation for address fields (must be positive integer)
- Data type dropdown with normalized options
- Description field allows multi-line text
- Writable toggle (checkbox or switch)

---

## Animations

**Minimal, purposeful animations only**:
- Page transitions: 200ms ease-in-out
- Button hover: 150ms scale(1.02)
- Toast slide-in: 300ms ease-out
- Progress bar: Smooth indeterminate animation during processing
- Table row hover: 100ms background color fade

---

## Responsive Breakpoints

- **Desktop** (1024px+): Full multi-column table, side-by-side preview
- **Tablet** (768px-1023px): Single column table with horizontal scroll
- **Mobile** (<768px): Stack all elements vertically, simplified table view (card-based)

---

## Accessibility

- ARIA labels for all interactive elements
- Keyboard navigation support (Tab, Enter, Escape)
- Focus indicators: 2px solid #2C5F9E outline
- Minimum touch target: 44px × 44px
- Color contrast ratio: 4.5:1 minimum for all text
- Screen reader announcements for status changes

---

## Images

**No hero image required** - This is a utility application focused on the conversion workflow. Visual emphasis should be on the upload zone and data preview, not decorative imagery.

If branding image needed: Small logo/icon (32px) in top-left corner only.