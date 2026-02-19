(() => {
  'use strict';

  if (window.__contextJiraLoaded) return;
  window.__contextJiraLoaded = true;

  // ─── Platform ────────────────────────────────────────────────────
  const isMac = navigator.platform.toUpperCase().includes('MAC') ||
                navigator.userAgent.includes('Macintosh');

  // ─── State ───────────────────────────────────────────────────────
  let panel = null;
  let downloadFolder = '';
  let sections = {
    metadata: true,
    description: true,
    acceptance: true,
    checklist: true,
    comments: true,
    attachments: true,
    links: true
  };

  chrome.storage.local.get(['downloadFolder', 'sections'], (result) => {
    downloadFolder = result.downloadFolder || '';
    if (result.sections) sections = { ...sections, ...result.sections };
  });

  function saveSections() {
    chrome.storage.local.set({ sections });
  }

  // ─── DOM Extraction ──────────────────────────────────────────────

  function getIssueKey() {
    const breadcrumb = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"] span');
    if (breadcrumb) return breadcrumb.textContent.trim();

    const match = window.location.pathname.match(/\/browse\/([A-Z]+-\d+)/);
    if (match) return match[1];

    const detailKey = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"] span');
    if (detailKey) return detailKey.textContent.trim();

    return null;
  }

  function getTitle() {
    const el =
      document.querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]') ||
      document.querySelector('h1[data-testid*="summary"]') ||
      document.querySelector('#summary-val') ||
      document.querySelector('h1');
    return el ? el.textContent.trim() : '';
  }

  function getDescription() {
    // Target the inner rendered content to avoid grabbing hidden edit views
    const descContainer =
      document.querySelector('[data-testid="issue.views.field.rich-text.description"] .ak-renderer-document') ||
      document.querySelector('[data-testid="issue.views.field.rich-text.description"] [data-testid*="read-view"]') ||
      document.querySelector('[data-testid="issue.views.field.rich-text.description"]') ||
      document.querySelector('#description-val') ||
      document.querySelector('[data-testid*="description"]');
    if (!descContainer) return '';
    return domToMarkdown(descContainer.cloneNode(true)).trim();
  }

  function domToMarkdown(node, depth = 0) {
    let md = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        md += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // Skip hidden elements (edit views, collapsed sections)
        if (child.hidden || child.getAttribute('aria-hidden') === 'true' ||
            child.style?.display === 'none' || child.classList?.contains('hidden')) continue;
        const tag = child.tagName.toLowerCase();
        const role = child.getAttribute('role');

        if (tag === 'br') {
          md += '\n';
        } else if (tag === 'p') {
          const inner = domToMarkdown(child, depth).trim();
          if (inner) md += inner + '\n\n';
        } else if (tag === 'div') {
          md += domToMarkdown(child, depth);
        } else if (tag === 'h1') {
          md += '# ' + domToMarkdown(child, depth).trim() + '\n\n';
        } else if (tag === 'h2') {
          md += '## ' + domToMarkdown(child, depth).trim() + '\n\n';
        } else if (tag === 'h3') {
          md += '### ' + domToMarkdown(child, depth).trim() + '\n\n';
        } else if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
          md += '#### ' + domToMarkdown(child, depth).trim() + '\n\n';
        } else if (tag === 'ul' || tag === 'ol') {
          md += domToMarkdown(child, depth) + '\n';
        } else if (tag === 'li') {
          const isOrdered = child.parentElement?.tagName.toLowerCase() === 'ol';
          const prefix = isOrdered ? '1. ' : '- ';
          const indent = '  '.repeat(depth);
          // Check for task list items (checkboxes)
          const checkbox = child.querySelector('input[type="checkbox"], [role="checkbox"]');
          const isChecked = checkbox && (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true');
          let inner = domToMarkdown(child, depth + 1).trim();
          if (checkbox) {
            inner = inner.replace(/^\[.\]\s*/, ''); // remove any existing checkbox text
            md += indent + '- [' + (isChecked ? 'x' : ' ') + '] ' + inner + '\n';
          } else {
            md += indent + prefix + inner + '\n';
          }
        } else if (tag === 'a') {
          const href = child.getAttribute('href') || '';
          const linkText = domToMarkdown(child, depth).trim();
          if (href && linkText && href !== linkText) {
            md += '[' + linkText + '](' + href + ')';
          } else {
            md += linkText || href;
          }
        } else if (tag === 'code') {
          if (child.parentElement?.tagName.toLowerCase() === 'pre') {
            md += domToMarkdown(child, depth);
          } else {
            md += '`' + domToMarkdown(child, depth) + '`';
          }
        } else if (tag === 'pre') {
          const lang = child.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || '';
          md += '\n```' + lang + '\n' + domToMarkdown(child, depth).trim() + '\n```\n\n';
        } else if (tag === 'strong' || tag === 'b') {
          const inner = domToMarkdown(child, depth);
          if (inner.trim()) md += '**' + inner.trim() + '**';
        } else if (tag === 'em' || tag === 'i') {
          const inner = domToMarkdown(child, depth);
          if (inner.trim()) md += '_' + inner.trim() + '_';
        } else if (tag === 'blockquote') {
          const inner = domToMarkdown(child, depth).trim();
          md += inner.split('\n').map(l => '> ' + l).join('\n') + '\n\n';
        } else if (tag === 'table') {
          md += tableToMarkdown(child) + '\n\n';
        } else if (tag === 'hr') {
          md += '\n---\n\n';
        } else if (tag === 'img') {
          const alt = child.getAttribute('alt') || 'image';
          const src = child.getAttribute('src') || '';
          md += '![' + alt + '](' + src + ')';
        } else if (role === 'checkbox' || (tag === 'input' && child.type === 'checkbox')) {
          // handled in li
        } else {
          md += domToMarkdown(child, depth);
        }
      }
    }
    return md;
  }

  function tableToMarkdown(table) {
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return '';
    let md = '';
    rows.forEach((row, i) => {
      const cells = row.querySelectorAll('th, td');
      const line = Array.from(cells).map(c => c.textContent.trim()).join(' | ');
      md += '| ' + line + ' |\n';
      if (i === 0) {
        md += '| ' + Array.from(cells).map(() => '---').join(' | ') + ' |\n';
      }
    });
    return md;
  }

  // ─── Metadata extraction ─────────────────────────────────────────

  function getMetadata() {
    const meta = {};

    // Type
    const typeEl = document.querySelector('[data-testid="issue.views.issue-base.foundation.issue-type.common.ui.issueType"] span') ||
                   document.querySelector('[data-testid*="issue-type"] img');
    if (typeEl) meta.type = typeEl.textContent?.trim() || typeEl.getAttribute('alt') || '';

    // Status
    const statusEl = document.querySelector('[data-testid="issue.views.issue-base.foundation.status.status-field-wrapper"] button span') ||
                     document.querySelector('[data-testid*="status"] span') ||
                     document.querySelector('#status-val span');
    if (statusEl) meta.status = statusEl.textContent.trim();

    // Priority
    const prioEl = document.querySelector('[data-testid="issue.views.field.priority.common.ui.read-view.wrapper"] img') ||
                   document.querySelector('[data-testid*="priority"] img') ||
                   document.querySelector('#priority-val img');
    if (prioEl) meta.priority = prioEl.getAttribute('alt') || prioEl.textContent?.trim() || '';

    // Assignee — target the inner link/span to avoid doubled name from avatar + text
    const assigneeContainer = document.querySelector('[data-testid="issue.views.field.user.assignee"]');
    if (assigneeContainer) {
      const assigneeLink = assigneeContainer.querySelector('a[role="presentation"], a[data-testid*="user-picker"]');
      const assigneeSpan = assigneeLink?.querySelector('span') || assigneeContainer.querySelector('span > span');
      meta.assignee = (assigneeSpan || assigneeLink || assigneeContainer.querySelector('span'))?.textContent.trim() || '';
    } else {
      const fallback = document.querySelector('#assignee-val span');
      if (fallback) meta.assignee = fallback.textContent.trim();
    }

    // Reporter — same approach
    const reporterContainer = document.querySelector('[data-testid="issue.views.field.user.reporter"]');
    if (reporterContainer) {
      const reporterLink = reporterContainer.querySelector('a[role="presentation"], a[data-testid*="user-picker"]');
      const reporterSpan = reporterLink?.querySelector('span') || reporterContainer.querySelector('span > span');
      meta.reporter = (reporterSpan || reporterLink || reporterContainer.querySelector('span'))?.textContent.trim() || '';
    } else {
      const fallback = document.querySelector('#reporter-val span');
      if (fallback) meta.reporter = fallback.textContent.trim();
    }

    // Labels
    const labelEls = document.querySelectorAll('[data-testid="issue.views.field.multi-select.labels"] a, #wrap-labels a');
    if (labelEls.length > 0) {
      meta.labels = Array.from(labelEls).map(l => l.textContent.trim()).filter(Boolean);
    }

    // Sprint
    const sprintEl = document.querySelector('[data-testid*="sprint"] span, #customfield_10020-val');
    if (sprintEl) meta.sprint = sprintEl.textContent.trim();

    // Story points / estimate — extract just the numeric value
    const pointsContainer = document.querySelector('[data-testid*="story-point"], [data-testid*="estimate"]');
    if (pointsContainer) {
      const pointsText = pointsContainer.textContent.trim();
      const numMatch = pointsText.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) meta.storyPoints = numMatch[1];
    }

    // Epic link
    const epicEl = document.querySelector('[data-testid*="epic-link"] a, [data-testid*="parent"] a');
    if (epicEl) meta.epic = epicEl.textContent.trim();

    // Created / Updated dates
    const timeEls = document.querySelectorAll('time[datetime]');
    if (timeEls.length >= 1) meta.created = timeEls[0].getAttribute('datetime');
    if (timeEls.length >= 2) meta.updated = timeEls[timeEls.length - 1].getAttribute('datetime');

    return meta;
  }

  // ─── Comments extraction ─────────────────────────────────────────

  function getComments() {
    const comments = [];
    const commentEls = document.querySelectorAll('[data-testid*="comment-base-item"], .activity-comment');

    commentEls.forEach((el) => {
      const authorEl = el.querySelector('[data-testid*="header-author"] span, .author');
      const timeEl = el.querySelector('time[datetime]');
      const bodyEl = el.querySelector('[data-testid*="comment-body"], .comment-body');

      if (bodyEl) {
        comments.push({
          author: authorEl?.textContent.trim() || 'Unknown',
          date: timeEl?.getAttribute('datetime') || '',
          body: domToMarkdown(bodyEl.cloneNode(true)).trim()
        });
      }
    });

    return comments;
  }

  // ─── Linked issues ───────────────────────────────────────────────

  function getLinkedIssues() {
    const links = [];
    const linkEls = document.querySelectorAll('[data-testid*="issue-links"] [data-testid*="link-item"], .link-content .link-item');

    linkEls.forEach((el) => {
      const keyEl = el.querySelector('[data-testid*="key"] a, a');
      const summaryEl = el.querySelector('[data-testid*="summary"] span, span');
      const typeEl = el.querySelector('[data-testid*="link-type"]');

      if (keyEl) {
        links.push({
          key: keyEl.textContent.trim(),
          summary: summaryEl?.textContent.trim() || '',
          type: typeEl?.textContent.trim() || ''
        });
      }
    });

    return links;
  }

  function getAttachments() {
    const attachments = [];
    const baseUrl = window.location.origin;

    // Method 1: Filmstrip view (current Jira Cloud)
    document.querySelectorAll('[data-testid*="attachment-id"]').forEach((item) => {
      const idMatch = (item.dataset.testid || '').match(/attachment-id\.(\d+)/);
      if (!idMatch) return;
      const attachmentId = idMatch[1];
      const card = item.querySelector('[data-testid="media-file-card-view"]');
      const filename = card?.getAttribute('data-test-media-name') ||
                       item.textContent?.trim().split(/\d{2}\s/)[0]?.trim() ||
                       `attachment-${attachmentId}`;
      attachments.push({
        url: `${baseUrl}/rest/api/3/attachment/content/${attachmentId}`,
        filename
      });
    });

    // Method 2: Gallery layout (older Jira Cloud)
    if (attachments.length === 0) {
      document.querySelectorAll('[data-testid="issue.views.issue-base.content.attachment.gallery-layout.thumbnail-card"]').forEach((item) => {
        const link = item.querySelector('a[href]');
        const nameEl = item.querySelector('[data-testid*="filename"]') || item.querySelector('span');
        if (link) {
          attachments.push({
            url: link.href,
            filename: nameEl ? nameEl.textContent.trim() : link.href.split('/').pop().split('?')[0]
          });
        }
      });
    }

    // Method 3: Classic Jira / Server fallback
    if (attachments.length === 0) {
      document.querySelectorAll('a[href*="/secure/attachment/"], a[href*="/attachment/"]').forEach((a) => {
        const filename = a.textContent.trim() || a.href.split('/').pop().split('?')[0];
        if (filename && !attachments.find(att => att.url === a.href)) {
          attachments.push({ url: a.href, filename });
        }
      });
    }

    return attachments;
  }

  // ─── AI-Native Markdown Builder ──────────────────────────────────

  function buildMarkdownContext(opts = {}) {
    const issueKey = getIssueKey();
    const title = getTitle();
    const description = getDescription();
    const meta = getMetadata();
    const comments = getComments();
    const linkedIssues = getLinkedIssues();
    const attachments = getAttachments();

    const s = { ...sections, ...opts };
    const lines = [];

    // Header
    lines.push(`# ${issueKey ? issueKey + ': ' : ''}${title}`);
    lines.push('');

    // Metadata block
    if (s.metadata) {
      lines.push('## Metadata');
      lines.push('');
      if (meta.type) lines.push(`- **Type:** ${meta.type}`);
      if (meta.status) lines.push(`- **Status:** ${meta.status}`);
      if (meta.priority) lines.push(`- **Priority:** ${meta.priority}`);
      if (meta.assignee) lines.push(`- **Assignee:** ${meta.assignee}`);
      if (meta.reporter) lines.push(`- **Reporter:** ${meta.reporter}`);
      if (meta.labels?.length) lines.push(`- **Labels:** ${meta.labels.join(', ')}`);
      if (meta.sprint) lines.push(`- **Sprint:** ${meta.sprint}`);
      if (meta.storyPoints) lines.push(`- **Story Points:** ${meta.storyPoints}`);
      if (meta.epic) lines.push(`- **Epic:** ${meta.epic}`);
      if (meta.created) lines.push(`- **Created:** ${meta.created}`);
      if (meta.updated) lines.push(`- **Updated:** ${meta.updated}`);
      lines.push('');
    }

    // Description
    if (s.description && description) {
      lines.push('## Description');
      lines.push('');
      lines.push(description.trim());
      lines.push('');
    }

    // Linked issues
    if (s.links && linkedIssues.length > 0) {
      lines.push('## Linked Issues');
      lines.push('');
      linkedIssues.forEach((link) => {
        const rel = link.type ? `(${link.type}) ` : '';
        lines.push(`- ${rel}**${link.key}**: ${link.summary}`);
      });
      lines.push('');
    }

    // Attachments list
    if (s.attachments && attachments.length > 0) {
      lines.push('## Attachments');
      lines.push('');
      attachments.forEach((a) => {
        lines.push(`- ${a.filename}`);
      });
      lines.push('');
    }

    // Comments
    if (s.comments && comments.length > 0) {
      lines.push('## Comments');
      lines.push('');
      comments.forEach((c) => {
        const date = c.date ? ` (${c.date})` : '';
        lines.push(`### ${c.author}${date}`);
        lines.push('');
        lines.push(c.body);
        lines.push('');
      });
    }

    // Clean up excessive blank lines
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // ─── Clipboard ───────────────────────────────────────────────────

  async function copyToClipboard(text) {
    text = text.trim();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  }

  function flashBtn(btn, success, label) {
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = success
      ? '<span class="cj-icon">&#10003;</span> Copied'
      : '<span class="cj-icon">&#10007;</span> Failed';
    btn.classList.add(success ? 'cj-flash-ok' : 'cj-flash-err');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.remove('cj-flash-ok', 'cj-flash-err');
    }, 1500);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Panel UI ────────────────────────────────────────────────────

  function createPanel() {
    if (panel) { panel.remove(); panel = null; return; }

    const issueKey = getIssueKey();
    const title = getTitle();
    const description = getDescription();
    const meta = getMetadata();
    const comments = getComments();
    const linkedIssues = getLinkedIssues();
    const attachments = getAttachments();

    panel = document.createElement('div');
    panel.id = 'cj-panel';

    // Status pill
    const statusBadge = meta.status
      ? `<span class="cj-status-badge">${escapeHtml(meta.status)}</span>`
      : '';
    const prioBadge = meta.priority
      ? `<span class="cj-prio-badge">${escapeHtml(meta.priority)}</span>`
      : '';

    panel.innerHTML = `
      <div class="cj-header">
        <div class="cj-header-left">
          <span class="cj-logo">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h12v1.5H2V3zm0 3h8v1.5H2V6zm0 3h10v1.5H2V9zm0 3h6v1.5H2V12z" fill="currentColor"/>
              <path d="M13 8l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </span>
          <div class="cj-header-text">
            <span class="cj-brand">ContextJira</span>
            <span class="cj-tagline">AI-Native Context</span>
          </div>
        </div>
        <button class="cj-close" title="Close">&times;</button>
      </div>

      <!-- Issue identity -->
      <div class="cj-identity">
        <div class="cj-issue-key">${escapeHtml(issueKey || 'Unknown')}</div>
        <div class="cj-issue-title">${escapeHtml(title || 'No title detected')}</div>
        <div class="cj-badges">${statusBadge}${prioBadge}</div>
      </div>

      <!-- Primary action -->
      <div class="cj-primary-action">
        <button class="cj-btn cj-btn-primary cj-copy-ai" ${!title ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="vertical-align: -2px; margin-right: 6px;">
            <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M3 5v8.5a1.5 1.5 0 001.5 1.5H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
          </svg>
          Copy Full Context as Markdown
        </button>
      </div>

      <!-- Quick copies -->
      <div class="cj-quick-row">
        <button class="cj-btn cj-btn-ghost cj-copy-title" ${!title ? 'disabled' : ''}>Title</button>
        <button class="cj-btn cj-btn-ghost cj-copy-desc" ${!description ? 'disabled' : ''}>Description</button>
        <button class="cj-btn cj-btn-ghost cj-copy-meta">Metadata</button>
      </div>

      <!-- Section toggles -->
      <div class="cj-section cj-toggles">
        <div class="cj-section-header">Include Sections</div>
        <div class="cj-toggle-grid">
          ${renderToggle('metadata', 'Metadata', Object.keys(meta).length > 0)}
          ${renderToggle('description', 'Description', !!description)}
          ${renderToggle('comments', 'Comments', comments.length > 0, comments.length)}
          ${renderToggle('links', 'Linked Issues', linkedIssues.length > 0, linkedIssues.length)}
          ${renderToggle('attachments', 'Attachments', attachments.length > 0, attachments.length)}
        </div>
      </div>

      <!-- Preview -->
      <div class="cj-section">
        <div class="cj-section-header">
          Markdown Preview
          <button class="cj-btn cj-btn-tiny cj-toggle-preview">Show</button>
        </div>
        <div class="cj-preview-wrap cj-hidden">
          <pre class="cj-preview"></pre>
        </div>
      </div>

      <!-- Attachments download -->
      ${attachments.length > 0 ? `
      <div class="cj-section cj-dl-section">
        <div class="cj-section-header">Download Attachments</div>
        <div class="cj-attachment-list">
          ${attachments.map((a, i) => `
            <div class="cj-attachment-item">
              <span class="cj-attachment-icon">${getFileIcon(a.filename)}</span>
              <span class="cj-attachment-name" title="${escapeHtml(a.filename)}">${escapeHtml(a.filename)}</span>
              <button class="cj-btn cj-btn-tiny cj-dl-one" data-idx="${i}">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="vertical-align: -1px;">
                  <path d="M8 2v9m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
        <div class="cj-folder-row">
          <input type="text" class="cj-folder-input" placeholder="Subfolder (e.g. jira-files)" value="${escapeHtml(downloadFolder)}" />
        </div>
        <button class="cj-btn cj-btn-secondary cj-dl-all">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="vertical-align: -1px; margin-right: 4px;">
            <path d="M8 2v9m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Download All (${attachments.length})
        </button>
      </div>` : ''}

      <div class="cj-footer">
        <span class="cj-shortcut-hint">${isMac ? 'Ctrl+Shift+J' : 'Ctrl+Shift+K'} to toggle</span>
      </div>
    `;

    document.body.appendChild(panel);
    bindEvents(issueKey, title, description, meta, comments, linkedIssues, attachments);
  }

  function renderToggle(key, label, hasData, count) {
    const checked = sections[key] ? 'checked' : '';
    const dimmed = !hasData ? 'cj-dimmed' : '';
    const badge = count !== undefined && count > 0 ? `<span class="cj-count">${count}</span>` : '';
    return `
      <label class="cj-toggle ${dimmed}">
        <input type="checkbox" data-section="${key}" ${checked} />
        <span class="cj-toggle-label">${label}${badge}</span>
      </label>
    `;
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊',
      zip: '📦', gz: '📦', tar: '📦', rar: '📦',
      mp4: '🎬', mov: '🎬', avi: '🎬',
      mp3: '🎵', wav: '🎵',
      json: '{ }', yaml: '{ }', yml: '{ }', xml: '{ }',
      py: '🐍', js: '📜', ts: '📜', java: '☕', go: '🔷',
      txt: '📋', md: '📋', log: '📋'
    };
    return icons[ext] || '📎';
  }

  function bindEvents(issueKey, title, description, meta, comments, linkedIssues, attachments) {
    // Close
    panel.querySelector('.cj-close').addEventListener('click', () => {
      panel.remove();
      panel = null;
    });

    // Section toggles
    panel.querySelectorAll('.cj-toggle input').forEach((cb) => {
      cb.addEventListener('change', () => {
        sections[cb.dataset.section] = cb.checked;
        saveSections();
      });
    });

    // Copy AI context
    panel.querySelector('.cj-copy-ai')?.addEventListener('click', async (e) => {
      const md = buildMarkdownContext();
      const ok = await copyToClipboard(md);
      flashBtn(e.currentTarget, ok);
    });

    // Copy title
    panel.querySelector('.cj-copy-title')?.addEventListener('click', async (e) => {
      const full = issueKey ? `${issueKey}: ${title}` : title;
      const ok = await copyToClipboard(full);
      flashBtn(e.currentTarget, ok);
    });

    // Copy description
    panel.querySelector('.cj-copy-desc')?.addEventListener('click', async (e) => {
      const ok = await copyToClipboard(description);
      flashBtn(e.currentTarget, ok);
    });

    // Copy metadata
    panel.querySelector('.cj-copy-meta')?.addEventListener('click', async (e) => {
      const md = buildMarkdownContext({ description: false, comments: false, links: false, attachments: false });
      const ok = await copyToClipboard(md);
      flashBtn(e.currentTarget, ok);
    });

    // Preview toggle
    const previewBtn = panel.querySelector('.cj-toggle-preview');
    const previewWrap = panel.querySelector('.cj-preview-wrap');
    const previewPre = panel.querySelector('.cj-preview');
    previewBtn?.addEventListener('click', () => {
      const hidden = previewWrap.classList.toggle('cj-hidden');
      previewBtn.textContent = hidden ? 'Show' : 'Hide';
      if (!hidden) {
        previewPre.textContent = buildMarkdownContext();
      }
    });

    // Folder input
    const folderInput = panel.querySelector('.cj-folder-input');
    if (folderInput) {
      folderInput.addEventListener('change', (e) => {
        downloadFolder = e.target.value.trim();
        chrome.storage.local.set({ downloadFolder });
      });
    }

    // Download single
    panel.querySelectorAll('.cj-dl-one').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const idx = parseInt(target.dataset.idx);
        const att = attachments[idx];
        const folder = folderInput?.value.trim() || '';
        chrome.runtime.sendMessage({
          action: 'downloadFile', url: att.url, filename: att.filename, folder
        }, (resp) => {
          flashBtn(target, resp?.success);
        });
      });
    });

    // Download all
    panel.querySelector('.cj-dl-all')?.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const folder = folderInput?.value.trim() || '';
      chrome.runtime.sendMessage({
        action: 'downloadAll', files: attachments, folder
      }, (resp) => {
        if (resp?.success) {
          target.innerHTML = `&#10003; Done (${resp.total - resp.failed}/${resp.total})`;
          setTimeout(() => {
            target.innerHTML = `Download All (${attachments.length})`;
          }, 2000);
        }
      });
    });
  }

  // ─── Floating trigger ────────────────────────────────────────────

  function injectTrigger() {
    const trigger = document.createElement('button');
    trigger.id = 'cj-trigger';
    trigger.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path d="M2 3h12v1.5H2V3zm0 3h8v1.5H2V6zm0 3h10v1.5H2V9zm0 3h6v1.5H2V12z" fill="currentColor"/>
        <path d="M13 8l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    `;
    trigger.title = 'ContextJira — AI-Native Context';
    trigger.addEventListener('click', createPanel);
    document.body.appendChild(trigger);
  }

  // ─── Keyboard shortcut ──────────────────────────────────────────
  // Mac: Ctrl+Shift+J (no conflict)
  // Windows/Linux: Ctrl+Shift+K (Ctrl+Shift+J opens DevTools, Alt+Shift switches keyboard layout)

  document.addEventListener('keydown', (e) => {
    const match = isMac
      ? (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J'
      : e.ctrlKey && e.shiftKey && e.key === 'K';
    if (match) {
      e.preventDefault();
      createPanel();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────
  injectTrigger();
})();
