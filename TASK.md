# TASK.md

# FieldCore Task: Phase 5B UX Follow-Up - Signature Drawing Screen

## Read First

Read `AGENTS.md` before making changes.

Work only inside this repository:

```cmd
C:\Dev\FieldCore_Software
```

Do not inspect Codex attachment paths.

Use Windows CMD-safe commands only:

```cmd
npm.cmd
npx.cmd
node
```

Do not use PowerShell commands.

Do not fight the shell. If a command fails because of quoting, escaping, redirection, or sandbox ACL, do not retry the same approach more than once. Use direct file edits/patches instead.

---

# Current State

Phase 5B proof photos and customer signature exist.

The current customer signature UI is wrong because it behaves like a file upload.

The desired behavior is:

```text
Worker clicks Sign
A white full-screen signing screen opens
Worker signs with finger/mouse
Worker can Clear
Worker can Done
Done saves the signature as PNG to the existing signature API
```

This is a frontend UX follow-up.

Do not rebuild Phase 5B.

Do not change database schema.

Do not create a migration.

Do not change proof photo logic.

Do not touch scheduling or money logic.

---

# Goal

Replace the customer signature file-upload style UI with a proper signature drawing flow.

The signature section in the job detail modal should have:

```text
Sign button
Delete button
Preview box
```

## Required Signature UI

In the job detail modal’s Customer Signature section:

### 1. Sign Button

Show a button:

```text
Sign
```

When clicked:

* Open a full-screen white signature screen/modal.
* The screen should contain a canvas.
* User can draw with mouse or finger.
* The canvas background should be white.
* The stroke should be dark/black.
* It must work on mobile/touch devices.

The white signing screen should have two buttons:

```text
Clear
Done
```

Clear:

* Clears the canvas.

Done:

* Converts the canvas to PNG.
* Uploads the PNG to the existing endpoint:

```text
POST /api/jobs/:id/signature
```

Use multipart `FormData`.

The uploaded file field must be:

```text
signature
```

Use filename:

```text
signature.png
```

If there is a signer name field already, keep it and include it in the `FormData` as:

```text
signerName
```

Do not build a complex signature library.

Use plain canvas.

---

### 2. Delete Button

Next to the Sign button, show a Delete button.

When clicked:

* Open a confirmation modal.
* Do not close the parent job detail modal.
* Use existing `openConfirmModal`.
* Use `closeExisting: false` if supported.

Modal text:

```text
Delete Signature
Are you sure you want to delete this customer signature?
```

Buttons:

```text
Cancel
Delete
```

If confirmed, call:

```text
DELETE /api/jobs/:id/signature
```

After delete:

* Refresh the job detail modal data.
* Preview box should show “Signature not available.”

If no signature exists, Delete can be disabled or hidden.

---

### 3. Signature Preview Box

Show a preview box in the Customer Signature section.

If signature exists:

* Show small preview image.
* Clicking the preview opens an enlarged modal.
* Enlarged modal should show the signature clearly.
* Include a Close button.

If no signature exists:

```text
Signature not available
```

The preview box should still be visible even when no signature exists.

---

# Existing API

Use the existing signature API.

Do not create new routes unless absolutely necessary.

Expected routes already exist:

```text
GET    /api/jobs/:id/signature
POST   /api/jobs/:id/signature
DELETE /api/jobs/:id/signature
```

Existing upload route expects multipart form data.

Use:

```js
const formData = new FormData();
formData.append('signature', blob, 'signature.png');
formData.append('signerName', signerName || '');
```

Then:

```js
fetch(`${API_BASE}/jobs/${jobId}/signature`, {
  method: 'POST',
  credentials: 'include',
  body: formData
});
```

Do not set `Content-Type` manually for multipart upload.

---

# Files Likely Involved

Likely files:

```text
assets/api.js
assets/app.css
```

Do not change Prisma schema.

Do not create migrations.

Do not edit backend unless the existing frontend cannot upload to the existing endpoint.

---

# Canvas Requirements

The signature canvas must:

* have a white background
* support mouse events
* support touch/pointer events
* save the actual drawn signature as PNG
* prevent page scrolling while signing on touch devices
* handle resizing reasonably

Recommended approach:

Use Pointer Events:

```text
pointerdown
pointermove
pointerup
pointercancel
```

Use:

```js
canvas.toBlob(...)
```

Upload the blob as:

```text
signature.png
```

Before saving, ensure the canvas is not empty.

If empty, show a message:

```text
Please sign before saving.
```

---

# UI Rules

Keep the existing FieldCore style.

Do not redesign the whole job modal.

Do not remove proof photo UI.

Do not remove completion requirement UI.

Do not remove lifecycle buttons.

Do not break:

```text
Arrived
Start
Pause
Resume
Complete
Proof photo upload
Completion evidence checks
Activity timeline
```

---

# Manual Test

After implementation:

1. Run:

```cmd
node --check assets/api.js
```

2. Start server:

```cmd
npm.cmd run dev
```

3. Login as worker:

```text
worker@fieldcore.test
FieldCoreDemo2026!
```

4. Open assigned job.

5. Go to Customer Signature section.

Expected:

```text
Sign button visible
Delete button visible or disabled if no signature exists
Preview box visible
Preview says Signature not available if no signature exists
```

6. Click Sign.

Expected:

```text
White full-screen signing screen opens
Canvas accepts finger/mouse drawing
Clear button clears canvas
Done button saves signature
```

7. After Done:

Expected:

```text
Signature preview appears
Signature captured status updates
Activity timeline shows SIGNATURE_ADDED or equivalent
No console error
```

8. Refresh page and reopen job.

Expected:

```text
Signature is still visible
Preview still works
```

9. Click preview.

Expected:

```text
Enlarged signature modal opens
Close button works
```

10. Click Delete.

Expected:

```text
Confirmation modal appears
Cancel keeps signature
Delete removes signature
Preview returns to Signature not available
Activity timeline shows SIGNATURE_REMOVED or equivalent
```

---

# Regression Test

Confirm:

```text
Proof photo upload still works
Worker completion still blocks if signature is required and missing
Worker can complete after signature is captured
Admin can still view signature
Admin can still delete signature if allowed
No console errors
```

---

# Checks

Use smallest checks only:

```cmd
node --check assets/api.js
```

If backend changed:

```cmd
node --check src/routes/api.js
```

After implementation:

```cmd
npm.cmd test
```

Do not run Prisma commands.

Do not run migrations.

---

# Done When

Done means:

```text
Signature is drawn on a white canvas screen
Clear button works
Done button uploads PNG signature
Delete button confirms before deletion
Preview box shows existing signature
Preview box says Signature not available when empty
Clicking preview enlarges signature
Worker can complete required-signature jobs after signing
Existing proof photo and lifecycle flows still work
Frontend syntax check passes
Tests pass
```
