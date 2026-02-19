<p align="center">
  <img src="icons/ContextJiraLogo.png" alt="ContextJira" width="280" />
</p>

<h1 align="center">ContextJira</h1>

<p align="center">
  <strong>AI-Native Context Selection for Jira</strong><br>
  Extract structured Markdown from any Jira issue — ready to paste into Claude, ChatGPT, or any LLM.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/version-2.0.0-blue" alt="Version" />
</p>

---

## What It Does

ContextJira sits on any Jira page and extracts issue data into clean, structured Markdown that LLMs can actually use. No more copy-pasting fragments or losing formatting.

**One click** gives you:

- Issue title, key, and full metadata (type, status, priority, assignee, reporter, sprint, story points, epic)
- Description with proper Markdown (headings, lists, code blocks, tables, links, images)
- Comments with authors and timestamps
- Linked issues with relationship types
- Attachment inventory with download links
- Checklist / acceptance criteria preservation

## Install

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome (or any Chromium browser)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Navigate to any Jira issue — the trigger button appears automatically

## Usage

| Action | How |
|---|---|
| Open panel | Click the floating button (bottom-right) or press `Ctrl+Shift+J` |
| Copy full context | Click **"Copy Full Context as Markdown"** |
| Copy title only | Click **Title** |
| Copy description only | Click **Description** |
| Copy metadata only | Click **Metadata** |
| Toggle sections | Check/uncheck sections under **Include Sections** |
| Preview output | Click **Show** under Markdown Preview |
| Download attachments | Individual or batch download with optional subfolder |

## Output Format

```markdown
# PROJ-123: Fix login redirect loop

## Metadata

- **Type:** Bug
- **Status:** In Progress
- **Priority:** High
- **Assignee:** Jane Doe
- **Reporter:** John Smith
- **Sprint:** Sprint 24
- **Story Points:** 3

## Description

Users are experiencing an infinite redirect loop when...

## Comments

### Jane Doe (2025-12-15T10:30:00Z)

Investigated — the issue is in the OAuth callback handler...

## Attachments

- screenshot.png
- error-log.txt
```

## Compatibility

- **Jira Cloud** (Atlassian Cloud) — full support
- **Jira Server / Data Center** — supported via fallback selectors
- **Browsers:** Chrome, Edge, Brave, Arc, and any Chromium-based browser (Manifest V3)

## Project Structure

```
ContextJira/
├── manifest.json      # Extension manifest (v3)
├── detector.js        # Lightweight Jira page detector
├── content.js         # Core extraction + panel UI
├── content.css        # Panel styling
├── background.js      # Service worker (injection + downloads)
├── popup.html         # Extension popup
├── popup.js           # Popup logic
└── icons/             # Extension icons
```

## License

MIT
