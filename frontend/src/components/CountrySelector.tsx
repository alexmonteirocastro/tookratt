import type { CountryCode } from "../api/types";
import { COUNTRY_OPTIONS } from "../utils/statsLabels";
import styles from "./CountrySelector.module.css";

interface CountrySelectorProps {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
  disabled?: boolean;
}

/**
 * ALE-192 Decision 2 — pill radio group, not a dropdown.
 * Six codes always fit; a <select> would hide equally-weighted options
 * behind an extra click. Native radios keep arrow-key a11y for free.
 */
export function CountrySelector({ value, onChange, disabled = false }: CountrySelectorProps) {
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Country</legend>
      <div className={styles.group} role="presentation">
        {COUNTRY_OPTIONS.map((option) => (
          <label key={option.code} className={styles.option} title={option.name}>
            <input
              className={styles.input}
              type="radio"
              name="stats-country"
              value={option.code}
              checked={value === option.code}
              aria-label={option.name}
              onChange={() => onChange(option.code)}
            />
            <span className={styles.code} aria-hidden="true">
              {option.code}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
