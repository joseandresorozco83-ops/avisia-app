/**
 * Escapes HTML special characters to prevent DOM XSS when rendering
 * untrusted external strings (e.g., reverse-geocoded place names) inside HTML templates.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
