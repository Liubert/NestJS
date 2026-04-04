---
phase: quick
plan: 260404-eqq
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-ui/src/pages/feedback/FeedbackPage.tsx
  - admin-ui/src/App.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Admin users see Feedback in the sidebar menu after AI Settings"
    - "Clicking Feedback navigates to /feedback and renders the FeedbackPage"
    - "Feedback items are fetched from GET /feedback and displayed grouped by user email in Collapse panels"
    - "Each panel header shows user email, item count badge, and MCP tag when applicable"
    - "Inside each panel, a Table shows date, category, severity, tool, message, status, reviewed columns"
    - "Expandable rows show full message, suggestion, agent info, session, reviewer note"
    - "Review action opens modal to mark item reviewed with a note"
    - "Filters for category, severity, reviewed status work and refetch data"
  artifacts:
    - path: "admin-ui/src/pages/feedback/FeedbackPage.tsx"
      provides: "Feedback page with grouped Collapse + Table layout"
      min_lines: 150
    - path: "admin-ui/src/App.tsx"
      provides: "Route, menu item, and import for FeedbackPage"
      contains: "FeedbackPage"
  key_links:
    - from: "admin-ui/src/App.tsx"
      to: "admin-ui/src/pages/feedback/FeedbackPage.tsx"
      via: "import and Route element"
      pattern: "import FeedbackPage"
    - from: "admin-ui/src/pages/feedback/FeedbackPage.tsx"
      to: "/feedback API"
      via: "apiClient.get('/feedback')"
      pattern: "apiClient\\.get.*feedback"
---

<objective>
Add a FeedbackPage to the admin UI that displays agent feedback entries grouped by author (user email), with filtering, expandable details, and a review action.

Purpose: Give admins visibility into agent feedback submitted via the MCP feedback endpoint, enabling review and triage.
Output: New FeedbackPage component + App.tsx wired with route and menu item.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-ui/src/App.tsx
@admin-ui/src/pages/users/UsersPage.tsx
@admin-ui/src/api/client.ts

<interfaces>
<!-- Existing patterns executor needs -->

From admin-ui/src/api/client.ts:
```typescript
// Axios instance with baseURL '/api', auto-attaches JWT from localStorage
export default apiClient;
```

From admin-ui/src/App.tsx (menu structure):
```typescript
// Admin-only menu items are in a conditional spread:
// ...(isAdmin ? [ { key: '/users', ... }, { key: '/ai-settings', ... } ] : [])
// New /feedback item goes after /ai-settings in this array

// selectedKey logic uses startsWith chains:
// location.pathname.startsWith('/projects') ? '/projects' : ...
// Add /feedback case
```

From admin-ui/src/pages/users/UsersPage.tsx (pattern reference):
```typescript
// Pattern: useQuery + useMutation + useQueryClient
// apiClient.get/post/patch/delete
// Ant Design Table with columns array, Tag for status colors
// Typography.Title level={3} for page heading
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create FeedbackPage component</name>
  <files>admin-ui/src/pages/feedback/FeedbackPage.tsx</files>
  <action>
Create `admin-ui/src/pages/feedback/FeedbackPage.tsx` following the UsersPage pattern (useQuery, useMutation, apiClient, Ant Design components).

**Interface definition at top of file:**
```ts
interface FeedbackItem {
  id: string;
  userId: string;
  projectId: string | null;
  isMcpToken: boolean;
  category: string;
  toolOrEndpoint: string | null;
  actionAttempted: string | null;
  resultStatus: string | null;
  severity: string;
  message: string;
  suggestion: string | null;
  agentName: string | null;
  agentVersion: string | null;
  sessionId: string | null;
  createdAt: string;
  reviewed: boolean;
  reviewerNote: string | null;
  user: { id: string; email: string };
  project: { id: string; slug: string } | null;
}
```

**State:**
- `category` filter (string | undefined)
- `severity` filter (string | undefined)
- `reviewed` filter (boolean | undefined)
- `page` (number, default 1), `limit` (number, default 50)
- `reviewModalOpen` (boolean), `reviewingItem` (FeedbackItem | null), `reviewerNote` (string)

**Data fetching:**
- `useQuery({ queryKey: ['feedback', category, severity, reviewed, page, limit], queryFn })` — calls `apiClient.get('/feedback', { params: { category, severity, reviewed, page, limit } })`, returns `res.data` (shape: `{ items: FeedbackItem[], total: number }`)

**Review mutation:**
- `useMutation({ mutationFn: (args: { id: string; reviewerNote: string }) => apiClient.patch(`/feedback/${args.id}`, { reviewed: true, reviewerNote: args.reviewerNote }) })` — on success: `message.success('Marked as reviewed')`, invalidate `['feedback']`, close modal, reset note

**Client-side grouping:**
```ts
const grouped = useMemo(() => {
  const map = new Map<string, FeedbackItem[]>();
  for (const item of items) {
    const key = item.user?.email ?? 'Unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}, [items]);
```

**Layout (top to bottom):**

1. `<Typography.Title level={3}>Feedback</Typography.Title>`

2. Filter bar: `<Row gutter={16} style={{ marginBottom: 16 }}>` with three `<Col>` each containing a `<Select>`:
   - Category: options = All, bug, confusion, missing_feature, suggestion, other. `allowClear`, placeholder "Category"
   - Severity: options = All, low, medium, high. `allowClear`, placeholder "Severity"
   - Reviewed: options = All, Yes (true), No (false). `allowClear`, placeholder "Reviewed"
   - Each Select: `style={{ width: 180 }}`, onChange sets respective state and resets page to 1

3. Loading: show `<Spin>` when `isLoading`

4. Main: `<Collapse accordion>` iterating over `grouped` entries (use `Array.from(grouped.entries())`):
   - Panel key = email
   - Panel header: `<Space>` with email text, `<Badge count={items.length} />`, and conditionally `<Tag color="green">MCP</Tag>` if any item in group has `isMcpToken === true`
   - Panel children: `<Table>` with `rowKey="id"`, `size="small"`, `pagination={false}`, columns:
     - **Date**: render `new Date(record.createdAt).toLocaleDateString()` + time
     - **Category**: render `<Tag color={...}>` with mapping: bug=red, confusion=orange, missing_feature=blue, suggestion=green, other=default
     - **Severity**: render `<Tag>` with mapping: high=red, medium=orange, low=green
     - **Tool/Endpoint**: `record.toolOrEndpoint || '\u2014'`
     - **Message**: truncate to 80 chars with ellipsis (`record.message?.length > 80 ? record.message.slice(0, 80) + '...' : record.message`)
     - **Status**: `record.resultStatus ? <Tag>{record.resultStatus}</Tag> : '\u2014'`
     - **Reviewed**: `record.reviewed ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>`
     - **Action**: `<Button size="small" onClick={() => { setReviewingItem(record); setReviewerNote(record.reviewerNote || ''); setReviewModalOpen(true); }}>Review</Button>`
   - `expandable` prop on Table: `expandedRowRender` returns `<Descriptions column={1} size="small" bordered>` with items: Full Message, Suggestion (if present), Agent Name, Agent Version, Session ID, Project (project?.slug or "---"), Reviewer Note (if present)

5. Pagination: `<Pagination current={page} pageSize={limit} total={total} onChange={(p) => setPage(p)} style={{ marginTop: 16, textAlign: 'right' }} showSizeChanger={false} />`

6. Review Modal: `<Modal title="Review Feedback" open={reviewModalOpen} onCancel={close} onOk={submit} confirmLoading={mutation.isPending}>` with `<Input.TextArea rows={3} value={reviewerNote} onChange={...} placeholder="Add a note (optional)" />`

**Imports needed:** React, useState, useMemo from 'react'; Table, Typography, Tag, Collapse, Badge, Space, Select, Row, Col, Spin, Pagination, Modal, Input, Button, Descriptions, message from 'antd'; useQuery, useMutation, useQueryClient from '@tanstack/react-query'; apiClient from '../../api/client'.

Export as `export default FeedbackPage`.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>FeedbackPage.tsx exists, compiles without TypeScript errors, contains Collapse grouping by user email, Table with all specified columns, filter Selects, review Modal, and Pagination.</done>
</task>

<task type="auto">
  <name>Task 2: Wire FeedbackPage into App.tsx</name>
  <files>admin-ui/src/App.tsx</files>
  <action>
Modify `admin-ui/src/App.tsx` with these exact changes:

1. **Add icon import** — add `MessageOutlined` to the `@ant-design/icons` import on line 6:
   ```
   import { ..., MessageOutlined } from '@ant-design/icons';
   ```

2. **Add page import** — after the ApiTokensPage import (line 19), add:
   ```
   import FeedbackPage from './pages/feedback/FeedbackPage';
   ```

3. **Add menu item** — in the `isAdmin` conditional array (lines 93-106), add after the AI Settings entry (after line 104, before the closing `]`):
   ```tsx
   {
     key: '/feedback',
     icon: <MessageOutlined />,
     label: <Link to="/feedback">Feedback</Link>,
   },
   ```

4. **Add route** — inside the nested `<Routes>` (after the `/api-tokens` route on line 184), add:
   ```tsx
   <Route path="/feedback" element={<FeedbackPage />} />
   ```

5. **Update selectedKey** — modify the selectedKey ternary chain (lines 110-114) to include `/feedback`:
   ```tsx
   const selectedKey = location.pathname.startsWith('/projects')
     ? '/projects'
     : location.pathname.startsWith('/ai-settings')
       ? '/ai-settings'
       : location.pathname.startsWith('/feedback')
         ? '/feedback'
         : location.pathname;
   ```
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>App.tsx imports FeedbackPage and MessageOutlined, has /feedback menu item in admin section after AI Settings, has /feedback route, selectedKey handles /feedback path.</done>
</task>

</tasks>

<verification>
1. `cd admin-ui && npx tsc --noEmit` — no TypeScript errors
2. `cd admin-ui && npm run build` — Vite build succeeds
3. Visual: admin user sees "Feedback" menu item in sidebar after AI Settings
4. Visual: /feedback page loads and shows filter bar + grouped collapse panels (when API has data)
</verification>

<success_criteria>
- FeedbackPage.tsx created with Collapse-grouped-by-email layout, filter bar, expandable Table rows, review Modal
- App.tsx has import, route, menu item, selectedKey for /feedback
- TypeScript compilation passes
- Build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/260404-eqq-add-feedbackpage-to-admin-ui-with-groupi/260404-eqq-SUMMARY.md`
</output>
