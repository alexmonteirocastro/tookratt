/** Ö lettermark, ALE-201. Ring colour comes from CSS so light and dark lockups share one shape. */
export function markMarkup(): string {
  return `<svg class="mark" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <line class="mark-connector" x1="17" y1="8" x2="31" y2="8" stroke-width="2"></line>
    <circle class="mark-dot" cx="17" cy="8" r="4"></circle>
    <circle class="mark-dot" cx="31" cy="8" r="4"></circle>
    <circle class="mark-ring" cx="24" cy="29" r="13" stroke-width="5.5"></circle>
  </svg>`
}
