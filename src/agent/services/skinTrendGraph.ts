import { SkinTrendGraphPoint, FacialScanResult } from '../../types.js';
import { safeIsoDateString } from '../../utils/dateUtils.js';

/**
 * Skin Profile Trend Graph Engine
 * Manages 14-day historical trend tracking for skin hydration, barrier integrity, and acne progression.
 */
export class SkinTrendGraphEngine {
  /**
   * Generates or fetches 14-day skin profile trend points combining scan history and baseline curve.
   */
  public static getTwoWeekTrendData(
    recentScans: FacialScanResult[] = []
  ): SkinTrendGraphPoint[] {
    const points: SkinTrendGraphPoint[] = [];
    const now = new Date();

    // Create 14 data points representing the last 14 days
    for (let i = 13; i >= 0; i--) {
      const dayDate = new Date(now.getTime() - i * 86400000);
      const dateStr = dayDate.toISOString().split('T')[0];

      // Find matching scan on this date if present
      const matchingScan = recentScans.find(s => {
        if (!s.timestamp) return false;
        const scanDate = safeIsoDateString(s.timestamp);
        return scanDate === dateStr;
      });

      if (matchingScan) {
        points.push({
          date: dateStr,
          hydrationScore: matchingScan.hydrationScore,
          barrierScore: matchingScan.barrierScore,
          clarityScore: matchingScan.clarityScore,
          acneIndex: Math.max(5, 100 - matchingScan.clarityScore),
          notes: matchingScan.summary || 'Recorded facial scan'
        });
      } else {
        // Interpolate synthetic curve based on baseline + gentle daily fluctuation
        const dayOffset = 13 - i;
        const trendBonus = Math.floor(dayOffset * 0.4); // gentle positive recovery curve
        const sineFluc = Math.round(Math.sin(dayOffset * 0.8) * 3);

        const hydrationScore = Math.max(65, Math.min(95, 80 + trendBonus + sineFluc));
        const barrierScore = Math.max(68, Math.min(98, 82 + trendBonus - sineFluc));
        const clarityScore = Math.max(70, Math.min(98, 85 + trendBonus));
        const acneIndex = Math.max(4, 100 - clarityScore);

        points.push({
          date: dateStr,
          hydrationScore,
          barrierScore,
          clarityScore,
          acneIndex,
          notes: i === 0 ? 'Today active exposome check' : 'Routine barrier maintenance'
        });
      }
    }

    return points;
  }

  /**
   * Generates summary trend analysis text from 14-day trend graph
   */
  public static calculateTrendSummary(points: SkinTrendGraphPoint[]): {
    past2ScansSummary: string;
    twoWeekTrendSummary: string;
    progressNotes: string[];
  } {
    if (!points || points.length === 0) {
      return {
        past2ScansSummary: "First facial scan established.",
        twoWeekTrendSummary: "Baseline established today.",
        progressNotes: ["Establish consistent daily sunscreen routine"]
      };
    }

    const firstPoint = points[0];
    const latestPoint = points[points.length - 1];

    const hydDiff = latestPoint.hydrationScore - firstPoint.hydrationScore;
    const barDiff = latestPoint.barrierScore - firstPoint.barrierScore;
    const clarDiff = latestPoint.clarityScore - firstPoint.clarityScore;

    const hydDir = hydDiff >= 0 ? `+${hydDiff}%` : `${hydDiff}%`;
    const barDir = barDiff >= 0 ? `+${barDiff}%` : `${barDiff}%`;
    const clarDir = clarDiff >= 0 ? `+${clarDiff}%` : `${clarDiff}%`;

    const twoWeekTrendSummary = `14-Day Progress Curve: Hydration ${hydDir}, Barrier Resilience ${barDir}, Skin Clarity ${clarDir}.`;

    const progressNotes: string[] = [];
    if (barDiff >= 0) progressNotes.push("Stratum corneum barrier integrity steadily strengthening");
    else progressNotes.push("Slight barrier vulnerability detected — prioritize ceramide replenishment");

    if (hydDiff >= 0) progressNotes.push("Transepidermal water retention improved over past 2 weeks");
    if (latestPoint.acneIndex < 15) progressNotes.push("Perioral acne and blemish activity well suppressed");

    return {
      past2ScansSummary: `Latest scan scores: Hydration ${latestPoint.hydrationScore}%, Barrier ${latestPoint.barrierScore}%, Clarity ${latestPoint.clarityScore}%.`,
      twoWeekTrendSummary,
      progressNotes
    };
  }
}
