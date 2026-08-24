import { useId } from "react";
import styles from "./CvUploader.module.css";

interface CvUploaderProps {
  disabled: boolean;
  onFileChosen: (fileName: string) => void;
}

export function CvUploader({ disabled, onFileChosen }: CvUploaderProps) {
  const inputId = useId();

  return (
    <div className={styles.bar}>
      <label htmlFor={inputId} className={styles.label}>
        Upload a CV to continue
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="file"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          onFileChosen(file.name);
          event.target.value = "";
        }}
      />
    </div>
  );
}
