// Lightweight Jira detector — runs on all pages but only activates on Jira instances.
// Detects: Atlassian Cloud, Jira Server/Data Center, self-hosted Jira.
(() => {
  'use strict';

  if (window.__contextJiraDetected) return;

  function isJiraPage() {
    // Atlassian Cloud
    if (location.hostname.endsWith('.atlassian.net')) return true;

    // Jira meta tags (Server / Data Center)
    const metaApp = document.querySelector('meta[name="application-name"][content*="JIRA"], meta[name="application-name"][content*="Jira"]');
    if (metaApp) return true;

    // Jira-specific elements
    if (document.querySelector('#jira, #jira-frontend, [data-testid="issue.views.issue-base.foundation.summary.heading"]')) return true;

    // Jira REST API indicator in page
    if (document.querySelector('meta[name="ajs-remote-user"], meta[name="ajs-version-number"]')) return true;

    // URL patterns for Jira
    if (/\/(browse|projects|issues|secure)\/[A-Z]+-\d+/.test(location.pathname)) return true;
    if (/\/jira\//.test(location.pathname)) return true;

    return false;
  }

  if (isJiraPage()) {
    window.__contextJiraDetected = true;
    // Request full injection from background
    chrome.runtime.sendMessage({ action: 'injectContextJira' });
  }
})();
