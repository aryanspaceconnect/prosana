/** Preview variant: B4 — trimmed to this variant's family + styles. */
import type { CSSProperties } from "react";
import styles from "./Orb.module.css";

/** The stage the geometry is tuned on; --orb-k scales it to `size`. */
const STAGE = 28;

/** Default rendered size — 20×20 indicator box. */
const SIZE = 20;

export type LensVariant = "B4" | "B1";
export type OrbVariant = LensVariant;

export const ORB_TASKS: Record<OrbVariant, string> = {
  B4: "Solving",
  B1: "Focusing",
};

export interface OrbProps {
  variant?: OrbVariant;
  /** Rendered edge length in px. The 28px geometry scales to fit. */
  size?: number;
  /** Accessible label, and the status text when `pill` is set. */
  label?: string;
  /** Wraps the orb and its label in a status pill. */
  pill?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Orb({
  variant = "B4",
  size = SIZE,
  label,
  pill,
  className,
  style,
}: OrbProps) {
  const text = label ?? ORB_TASKS[variant] + "…";
  return (
    <span
      className={styles.root + (className ? " " + className : "")}
      data-pill={pill ? "" : undefined}
      style={style}
    >
      <span
        className={styles.glyph}
        // In pill form the visible label already carries the meaning, so
        // the glyph steps out of the accessibility tree.
        role={pill ? undefined : "img"}
        aria-label={pill ? undefined : text}
        aria-hidden={pill ? true : undefined}
        style={
          { width: size, height: size, "--orb-k": size / STAGE } as CSSProperties
        }
      >
        <span className={styles.lens} data-variant={variant}>
          <span className={styles.shape + " " + styles.shapeA} />
          <span className={styles.shape + " " + styles.shapeB} />
          <span className={styles.shape + " " + styles.shapeC} />
          {/* focus is the one variant that needs a fourth circle */}
          {variant === "B1" && (
            <span className={styles.shape + " " + styles.shapeD} />
          )}
        </span>
      </span>
      {pill && <span className={styles.pillLabel}>{text}</span>}
    </span>
  );
}
