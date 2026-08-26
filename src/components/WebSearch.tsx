import styles from "./WebSearch.module.css";
import { useEffect, useState } from "react";

interface SiteItem {
  title: string;
  url: string;
  discover: number;
  finish: number;
}

interface WebSearchProps {
  query?: string;
  sites?: SiteItem[];
}

const DEFAULT_QUERY = "Skin barrier repair & active ingredient compatibility";

const DEFAULT_SITES: SiteItem[] = [
  { title: "Dermatology Research & Barrier Care", url: "ncbi.nlm.nih.gov/pmc/articles/skin-barrier", discover: 400, finish: 1800 },
  { title: "Active Ingredients & Clinical Guidelines", url: "dermnetnz.org/topics/skincare-actives", discover: 1200, finish: 3200 },
  { title: "SANA Clinical Science & Formulation Index", url: "sana.ai/research/formulation-safety", discover: 2200, finish: 4400 },
];

// Six meridians, phase-offset by 1/6 of the cycle, read as one rotating sphere.
const M = {
  L: "M6.057 11.565 C2.081 11.565 0.371 8.159 0.371 5.964 C0.371 3.642 2.152 0.329 6.05 0.329",
  ML: "M6.012 11.55 C4.575 10.496 3.333 8.116 3.321 5.964 C3.307 3.399 4.974 0.977 6.012 0.329",
  MR: "M6.012 11.55 C7.211 10.781 8.715 8.287 8.715 5.964 C8.715 3.399 7.24 1.233 6.012 0.329",
  R: "M6.012 11.55 C9.677 11.55 11.65 8.487 11.65 5.964 C11.65 3.499 9.748 0.329 6.012 0.329",
};

function Globe() {
  const values = [M.L, M.ML, M.MR, M.R, M.L].join(";");
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="0.85" strokeLinecap="round" style={{ overflow: "visible" }}>
      <circle cx="6" cy="6" r="5.7" opacity="0.9" />
      <line x1="0.3" y1="6" x2="11.7" y2="6" opacity="0.9" />
      {["0s", "-1.2s", "-2.4s", "-3.6s", "-4.8s", "-6s"].map((begin) => (
        <path key={begin} d={M.L} opacity="0">
          <animate attributeName="d" dur="7.2s" begin={begin} repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.25;0.5;0.75;1"
            keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1" values={values} />
          <animate attributeName="opacity" dur="7.2s" begin={begin} repeatCount="indefinite"
            calcMode="linear" keyTimes="0;0.05;0.7;0.75;1" values="0;0.9;0.9;0;0" />
        </path>
      ))}
    </svg>
  );
}

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
);
const Caret = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
);
const ArrowUp = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>
);
const Dots = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="1.8" strokeDasharray="1.8 3.6" strokeLinecap="round" /></svg>
);
const Check = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
);

export function WebSearch({ query = DEFAULT_QUERY, sites = DEFAULT_SITES }: WebSearchProps) {
  const [states, setStates] = useState<string[]>(() => sites.map(() => "pending"));
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    const last = Math.max(...sites.map((s) => s.finish));
    const run = () => {
      setStates(sites.map(() => "pending"));
      setDone(false);
      timers = [];
      const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
      sites.forEach((site, i) => {
        at(site.discover, () => setStates((p) => p.map((v, j) => (j === i ? "loading" : v))));
        at(site.finish, () => setStates((p) => p.map((v, j) => (j === i ? "done" : v))));
      });
      at(last + 800, () => setDone(true));
    };
    run();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [sites]);

  return (
    <div className={styles.ws} data-state={done ? "done" : "loading"}>
      <div className={styles.wsRow}>
        <SearchIcon />

        <span className={styles.wsLabel}>
          <span className={styles.wsShimmer + (done ? " " + styles.isDone : "")}>
            {done ? 'Researched' : 'Searching'} <span className={styles.wsQuote}>“{query}”</span>
          </span>
          <button type="button" className={styles.wsChevron} aria-label="Toggle results"
            aria-expanded={open} onClick={() => setOpen((o) => !o)}><Caret /></button>
        </span>
      </div>

      <div className={styles.wsCollapsible + (open ? "" : " " + styles.isCollapsed)}>
        <div className={styles.wsCollapsibleInner}>
          <div className={styles.wsResults}>
            <span className={styles.wsRail} />
            <ul className={styles.wsList}>
              {sites.map((site, i) => (
                <li key={site.url + i} className={styles.wsSite} data-state={states[i]}>
                  <span className={styles.wsBullet}>
                    <span className={styles.wsDots}><Dots /></span>
                    <span className={styles.wsGlobe}><Globe /></span>
                    <span className={styles.wsCheck}><Check /></span>
                  </span>
                  <span className={styles.wsTitle}>{site.title}</span>
                  <span className={styles.wsSep}>·</span>
                  <span className={styles.wsUrl}>{site.url}</span>
                  <span className={styles.wsArrow}><ArrowUp /></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WebSearch;
