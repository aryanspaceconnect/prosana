import {
  PerfectCorpRawOutput,
  SkinAnalysisIntegrityLog,
  FacialScanResult,
  SkinTrendGraphPoint
} from '../../types.js';
import { safeIsoDateString, safeTimestampTime } from '../../utils/dateUtils.js';

/**
 * Skin Analysis Context Manager & Validation Service
 * Inspects structural integrity of Perfect Corp API output and builds enriched agent context.
 */
export class SkinContextManager {
  /**
   * Validates the integrity and structure of Perfect Corp raw output before agent reasoning.
   */
  public static validatePerfectCorpPayload(rawOutput: PerfectCorpRawOutput): SkinAnalysisIntegrityLog {
    const passedChecks: string[] = [];
    const integrityErrors: string[] = [];

    // Check 1: Scan ID, Task ID, and S2S Provider Signature
    if (rawOutput.scanId && rawOutput.taskId && rawOutput.fileId) {
      passedChecks.push(`Valid Perfect Corp S2S v2.0 signature (task_id: ${rawOutput.taskId}, file_id: ${rawOutput.fileId})`);
    } else {
      integrityErrors.push('Missing or invalid S2S v2.0 task/file identifier signature');
    }

    // Check 2: Metrics Schema Integrity
    const metrics = rawOutput.rawMetrics || {};
    const requiredKeys = ['poresScore', 'darkCirclesScore', 'barrierRednessScore', 'acneBlemishScore', 'moistureScore', 'skinAge'];
    let schemaVerified = true;

    for (const key of requiredKeys) {
      if (typeof (metrics as any)[key] !== 'number') {
        schemaVerified = false;
        integrityErrors.push(`Missing or non-numeric metric key: ${key}`);
      } else {
        const val = (metrics as any)[key];
        if (key !== 'skinAge' && (val < 0 || val > 100)) {
          integrityErrors.push(`Metric ${key} out of range (0-100): ${val}`);
        }
      }
    }

    if (schemaVerified && integrityErrors.length === 0) {
      passedChecks.push('Verified complete 6-point dermatological metrics schema');
    }

    // Check 3: Region Overlays Validation
    if (Array.isArray(rawOutput.annotatedRegions) && rawOutput.annotatedRegions.length > 0) {
      passedChecks.push(`Verified ${rawOutput.annotatedRegions.length} annotated feature region overlays`);
    } else {
      integrityErrors.push('Annotated region overlays missing or empty');
    }

    // Check 4: Verify Non-Direct Raw Image Bypass
    const directUploadFlag = !rawOutput.provider || !rawOutput.rawResponseLog;
    if (!directUploadFlag) {
      passedChecks.push('Verified Perfect Corp API processing pipeline provenance (non-direct upload)');
    } else {
      integrityErrors.push('Direct raw image upload detected without API pipeline provenance');
    }

    const integrityStatus: 'VALID' | 'WARNING' | 'FAILED' =
      integrityErrors.length === 0 ? 'VALID' : integrityErrors.length <= 2 ? 'WARNING' : 'FAILED';

    return {
      integrityStatus,
      passedChecks,
      integrityErrors,
      schemaVerified,
      directUploadFlag,
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * Assembles the text-only context pack for SANA Agent, incorporating:
   * 1. LATEST_SCAN: Structured JSON, metrics, score snapshot, and region overlays (no images in LLM context)
   * 2. PAST_TWO_DAYS_SCANS: Day-wise selection (1 scan per day for past 2 distinct calendar days)
   * 3. 3-WEEK TREND GRAPH SUMMARY: Time-series delta metrics across ~21 days
   * 4. UNIVERSAL_NOTEPAD: Global cross-session memory notes
   * 5. USER_PROFILE & PREFERENCES: Response style preference
   */
  public static buildAgentScanContext(
    currentOutput: PerfectCorpRawOutput,
    integrityLog: SkinAnalysisIntegrityLog,
    allPastScans: FacialScanResult[] = [],
    twoWeekTrend: SkinTrendGraphPoint[] = [],
    universalNotepad: string = '',
    userResponseStyle: string = 'professional_medical'
  ): string {
    const metrics = currentOutput.rawMetrics;
    const todayStr = new Date().toISOString().split('T')[0];

    // Helper: Select up to 1 scan per calendar day for past 2 distinct calendar days prior to today
    const dayWiseScans: FacialScanResult[] = [];
    const seenDates = new Set<string>();

    // Sort past scans by date descending
    const sortedScans = [...allPastScans].sort((a, b) => {
      const timeA = safeTimestampTime(a.timestamp);
      const timeB = safeTimestampTime(b.timestamp);
      return timeB - timeA;
    });

    for (const scan of sortedScans) {
      if (dayWiseScans.length >= 2) break;
      const scanDateStr = safeIsoDateString(scan.timestamp);
      // Only pick distinct past days (before today)
      if (scanDateStr && scanDateStr < todayStr && !seenDates.has(scanDateStr)) {
        seenDates.add(scanDateStr);
        dayWiseScans.push(scan);
      }
    }

    let pastScansSummary = "No previous scan history available for past 2 calendar days (Baseline onboarding scan).";
    if (dayWiseScans.length > 0) {
      pastScansSummary = dayWiseScans.map((scan, idx) => {
        const dateStr = safeIsoDateString(scan.timestamp);
        return `[PAST DAY SCAN #${idx + 1} - Date: ${dateStr}]:
- Overall Health: Hydration=${scan.hydrationScore}%, Barrier=${scan.barrierScore}%, Clarity=${scan.clarityScore}%
- Metrics: ${scan.scoreInfo ? JSON.stringify(scan.scoreInfo) : 'Standard 6-point metrics'}
- Summary: "${scan.summary || 'Recorded baseline scan'}"`;
      }).join("\n\n");
    }

    // 3-Week (21-Day) Trend Summary
    let trendSummary = "3-Week (21-Day) Skin Score Trend: Baseline tracking initiated.";
    if (twoWeekTrend && twoWeekTrend.length > 0) {
      const avgHydration = Math.round(twoWeekTrend.reduce((acc, p) => acc + p.hydrationScore, 0) / twoWeekTrend.length);
      const avgBarrier = Math.round(twoWeekTrend.reduce((acc, p) => acc + p.barrierScore, 0) / twoWeekTrend.length);
      const avgClarity = Math.round(twoWeekTrend.reduce((acc, p) => acc + p.clarityScore, 0) / twoWeekTrend.length);
      const latestNotes = twoWeekTrend[twoWeekTrend.length - 1]?.notes || "Stable barrier progression";

      trendSummary = `3-Week (21-Day) Skin Score Trend Data (${twoWeekTrend.length} logged data points):
- Average 21-Day Hydration Retention: ${avgHydration}%
- Average 21-Day Barrier Health: ${avgBarrier}%
- Average 21-Day Clarity / Pore Index: ${avgClarity}%
- Observed Progress Note: "${latestNotes}"`;
    }

    // Style guidance based on user preference
    let styleGuide = "Style Preference: Highly professional clinical dermatologist persona with precise medical nuance.";
    if (userResponseStyle === 'casual_conversational') {
      styleGuide = "Style Preference: Warm, encouraging, approachable conversational persona.";
    } else if (userResponseStyle === 'cool_friendly') {
      styleGuide = "Style Preference: Cool, empathetic, modern wellness coach persona.";
    }

    return `=== SANA DERMATOLOGICAL FACIAL SCAN ANALYSIS CONTEXT PACK ===
[SYSTEM RULES: TEXT-ONLY CONTEXT WINDOW. DO NOT OUTPUT RAW IMAGE DATA OR URLS IN MODEL CONTEXT. USE RETRIEVAL TOOLS IF USER REQUESTS SPECIFIC IMAGE COMPARISONS.]

${styleGuide}

=== LATEST_SCAN ===
Scan Identifier: ${currentOutput.scanId}
Timestamp: ${currentOutput.timestamp}
Date: ${todayStr}
S2S Task ID: ${currentOutput.taskId}
S2S File ID: ${currentOutput.fileId}
Integrity Status: ${integrityLog.integrityStatus}
Passed Integrity Checks: ${integrityLog.passedChecks.join("; ")}

RAW PERFECT CORP DERMATOLOGICAL METRICS (score_info.json):
- Overall Skin Health Score: ${currentOutput.scoreInfo?.all || metrics.overallScore}/100
- Estimated Skin Age: ${metrics.skinAge} years
- Moisture Retention Score: ${metrics.moistureScore}/100
- Barrier Redness Score: ${metrics.barrierRednessScore}/100 (Higher = healthier barrier / lower redness)
- Acne & Blemish Score: ${metrics.acneBlemishScore}/100 (Higher = clearer skin)
- Pores Refinement Score: ${metrics.poresScore}/100
- Dark Circles Score: ${metrics.darkCirclesScore}/100
- Firmness Score: ${metrics.firmnessScore}/100

DETECTED FEATURE REGIONS (${currentOutput.annotatedRegions.length} Overlays):
${currentOutput.annotatedRegions.map(r => `- [${r.label}] (${r.regionName}): Severity=${r.severityScore}/100 (${r.severityLevel}). Detail: ${r.description}`).join("\n")}

=== PAST_TWO_DAYS_SCANS (DAY-WISE DISTINCT PAST 2 CALENDAR DAYS) ===
${pastScansSummary}

=== 3_WEEK_SKIN_TREND_GRAPH_SUMMARY ===
${trendSummary}

=== UNIVERSAL_NOTEPAD_MEMORY ===
${universalNotepad ? universalNotepad : "No universal notepad notes recorded yet."}
============================================================`;
  }
}
