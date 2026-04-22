/*
 * RAPPI STORE AVAILABILITY INTELLIGENCE — Monolito principal
 * Design: Editorial Financiero
 * Paleta: crema/tinta, rojo Rappi, teal, ámbar
 * Tipografía: Playfair Display + IBM Plex Mono + Source Serif 4
 * Pantallas: Upload → API Key Modal → Dashboard (KPIs + Charts + Table + Chat)
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataPoint {
  timestamp: Date;
  value: number;
}

interface ParsedCSV {
  metricName: string;
  points: DataPoint[];
  fileName: string;
}

interface FileEntry {
  file: File;
  status: "valid" | "error";
  error?: string;
  parsed?: ParsedCSV;
}

interface KPIs {
  peak: { value: number; timestamp: Date };
  average: number;
  minimum: { value: number; timestamp: Date };
  totalPoints: number;
  rangeStart: Date;
  rangeEnd: Date;
}

interface TableRow {
  timestamp: Date;
  value: number;
  variation: number;
  status: "PEAK" | "MÍNIMO" | "Normal";
  note: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Screen = "upload" | "dashboard";
type TimeFilter = "all" | "0-8" | "8-12" | "12-18" | "18-24";

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseTimestamp(raw: string): Date | null {
  try {
    // Format: "Mon Jan 01 2024 00:00:00 GMT-0500"
    const cleaned = raw.trim();
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
    return null;
  } catch {
    return null;
  }
}

function parseCSV(content: string, fileName: string): ParsedCSV {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV debe tener al menos 2 filas");

  const headerLine = lines[0];
  const dataLine = lines[1];

  // Parse headers (CSV-aware split)
  const headers = splitCSVLine(headerLine);
  const dataValues = splitCSVLine(dataLine);

  if (headers.length < 5) throw new Error("CSV debe tener al menos 5 columnas");

  // Metric name is column index 2 (0-based)
  const metricName = dataValues[2]?.trim() || "Métrica";

  // Timestamps start at column 4 (index 4)
  const points: DataPoint[] = [];
  for (let i = 4; i < headers.length; i++) {
    const ts = parseTimestamp(headers[i]);
    const rawVal = dataValues[i]?.replace(/,/g, "").trim();
    const val = rawVal ? parseInt(rawVal, 10) : NaN;
    if (ts && !isNaN(val)) {
      points.push({ timestamp: ts, value: val });
    }
  }

  if (points.length === 0) throw new Error("No se encontraron puntos de datos válidos");

  return { metricName, points, fileName };
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Data Analysis ────────────────────────────────────────────────────────────

function mergeDatasets(datasets: ParsedCSV[]): DataPoint[] {
  if (datasets.length === 0) return [];
  if (datasets.length === 1) return datasets[0].points;
  // Merge by summing values at same timestamps, or just concatenate and sort
  const all: DataPoint[] = datasets.flatMap((d) => d.points);
  all.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return all;
}

function filterByTimeRange(points: DataPoint[], filter: TimeFilter): DataPoint[] {
  if (filter === "all") return points;
  const [start, end] = filter.split("-").map(Number);
  return points.filter((p) => {
    const h = p.timestamp.getHours();
    if (end === 24) return h >= start;
    return h >= start && h < end;
  });
}

function computeKPIs(points: DataPoint[]): KPIs | null {
  if (points.length === 0) return null;
  let peak = points[0];
  let minimum = points[0];
  let sum = 0;
  for (const p of points) {
    if (p.value > peak.value) peak = p;
    if (p.value < minimum.value) minimum = p;
    sum += p.value;
  }
  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return {
    peak: { value: peak.value, timestamp: peak.timestamp },
    average: Math.round(sum / points.length),
    minimum: { value: minimum.value, timestamp: minimum.timestamp },
    totalPoints: points.length,
    rangeStart: sorted[0].timestamp,
    rangeEnd: sorted[sorted.length - 1].timestamp,
  };
}

function computeHourlyAverages(points: DataPoint[]): { hour: number; avg: number }[] {
  const buckets: { sum: number; count: number }[] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
  for (const p of points) {
    const h = p.timestamp.getHours();
    buckets[h].sum += p.value;
    buckets[h].count += 1;
  }
  return buckets.map((b, h) => ({ hour: h, avg: b.count > 0 ? Math.round(b.sum / b.count) : 0 }));
}

function samplePoints(points: DataPoint[], maxPoints = 300): DataPoint[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result: DataPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  return result;
}

function computeTableRows(points: DataPoint[]): TableRow[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let peakIdx = 0;
  let minIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].value > sorted[peakIdx].value) peakIdx = i;
    if (sorted[i].value < sorted[minIdx].value) minIdx = i;
  }

  const selectedIndices = new Set<number>();
  // Always include peak and min
  selectedIndices.add(peakIdx);
  selectedIndices.add(minIdx);

  // Add ~6 more evenly distributed
  const step = Math.floor(sorted.length / 6);
  for (let i = 0; i < 6; i++) {
    const idx = Math.min(i * step, sorted.length - 1);
    selectedIndices.add(idx);
  }

  const indices = Array.from(selectedIndices).sort((a, b) => a - b).slice(0, 8);

  return indices.map((idx) => {
    const p = sorted[idx];
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const variation = prev ? Math.round(((p.value - prev.value) / Math.max(prev.value, 1)) * 100) : 0;

    let status: "PEAK" | "MÍNIMO" | "Normal" = "Normal";
    if (idx === peakIdx) status = "PEAK";
    else if (idx === minIdx) status = "MÍNIMO";

    const h = p.timestamp.getHours();
    let note = "Operación normal";
    if (idx === peakIdx) note = "Máximo del período";
    else if (idx === minIdx) note = "Mínimo del período";
    else if (h >= 0 && h < 6) note = "Madrugada";
    else if (h >= 6 && h < 10) note = "Crecimiento matutino";

    return { timestamp: p.timestamp, value: p.value, variation, status, note };
  });
}

function buildSystemPrompt(datasets: ParsedCSV[], allPoints: DataPoint[]): string {
  const kpis = computeKPIs(allPoints);
  if (!kpis) return "Eres un analista de datos operacionales de Rappi.";

  const hourlyAvgs = computeHourlyAverages(allPoints);
  const hourlyStr = hourlyAvgs
    .filter((h) => h.avg > 0)
    .map((h) => `${String(h.hour).padStart(2, "0")}h: ${h.avg}`)
    .join(", ");

  // Find drops > 10%
  const sorted = [...allPoints].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const drops: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value;
    const curr = sorted[i].value;
    if (prev > 0 && ((prev - curr) / prev) * 100 > 10) {
      drops.push(
        `${formatTimestamp(sorted[i].timestamp)}: ${prev}→${curr} (${Math.round(((prev - curr) / prev) * 100)}%↓)`
      );
    }
  }

  const metricNames = datasets.map((d) => d.metricName).join(", ");

  return `Eres un analista de datos operacionales de Rappi.
DATASET:
- Métrica: ${metricNames}
- Período: ${formatTimestamp(kpis.rangeStart)} → ${formatTimestamp(kpis.rangeEnd)}
- Total de puntos: ${kpis.totalPoints}
- Máximo: ${kpis.peak.value} tiendas en ${formatTimestamp(kpis.peak.timestamp)}
- Mínimo: ${kpis.minimum.value} tiendas en ${formatTimestamp(kpis.minimum.timestamp)}
- Promedio: ${kpis.average} tiendas
- Promedios por hora: ${hourlyStr}
- Caídas >10%: ${drops.length > 0 ? drops.slice(0, 5).join(" | ") : "Ninguna detectada"}
Responde siempre en español, de forma concisa y analítica.`;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatTimestamp(d: Date): string {
  return d.toLocaleString("es-MX", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function formatNumber(n: number): string {
  return n.toLocaleString("es-MX");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Top Bar
function TopBar({
  pointCount,
  onReset,
}: {
  pointCount: number | null;
  onReset: () => void;
}) {
  return (
    <header
      style={{
        backgroundColor: "#1A1208",
        height: "48px",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: "16px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid #2A2010",
      }}
    >
      {/* Logo */}
      <span
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 900,
          fontSize: "20px",
          color: "#C8321A",
          letterSpacing: "0.05em",
          flexShrink: 0,
        }}
      >
        RAPPI
      </span>

      <div
        style={{
          width: "1px",
          height: "20px",
          backgroundColor: "#3A3020",
          flexShrink: 0,
        }}
      />

      {/* Title */}
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 500,
          fontSize: "11px",
          letterSpacing: "0.12em",
          color: "#CFC0A0",
          textTransform: "uppercase",
          flex: 1,
        }}
      >
        Store Availability Intelligence
      </span>

      {/* Point counter */}
      {pointCount !== null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px",
            color: "#8A7D6A",
          }}
        >
          <span
            className="pulse-dot"
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "#24A898",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#CFC0A0" }}>{formatNumber(pointCount)}</span>
          <span>pts</span>
        </div>
      )}

      {/* Reset button */}
      {pointCount !== null && (
        <button
          onClick={onReset}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px",
            fontWeight: 500,
            color: "#8A7D6A",
            background: "none",
            border: "1px solid #3A3020",
            padding: "4px 10px",
            cursor: "pointer",
            letterSpacing: "0.08em",
            transition: "all 150ms ease-out",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#CFC0A0";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#8A7D6A";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#8A7D6A";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#3A3020";
          }}
        >
          ↩ NUEVO
        </button>
      )}
    </header>
  );
}

// Section Divider
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="section-divider" style={{ margin: "20px 0 16px" }}>
      <span>{label}</span>
    </div>
  );
}

// KPI Card
function KPICard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "red" | "teal" | "amber" | "default";
}) {
  const accentColor =
    accent === "red"
      ? "#C8321A"
      : accent === "teal"
      ? "#1A7A6E"
      : accent === "amber"
      ? "#D4820A"
      : "#1A1208";

  return (
    <div
      className="kpi-animate"
      style={{
        flex: 1,
        minWidth: 0,
        borderRight: "1px solid #D4C8B0",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "10px",
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#8A7D6A",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 900,
          fontSize: "42px",
          lineHeight: 1,
          color: accentColor,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            color: "#8A7D6A",
            marginTop: "2px",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// Custom Tooltip for Recharts
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: "#FDFAF4",
        border: "1px solid #D4C8B0",
        padding: "8px 12px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "11px",
        color: "#1A1208",
      }}
    >
      <div style={{ color: "#8A7D6A", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontWeight: 500 }}>
        {formatNumber(payload[0].value)} tiendas
      </div>
    </div>
  );
}

// ─── Upload Screen ─────────────────────────────────────────────────────────────

function UploadScreen({
  onGenerate,
}: {
  onGenerate: (files: FileEntry[]) => void;
}) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (rawFiles: File[]) => {
    const entries: FileEntry[] = await Promise.all(
      rawFiles.map(async (f) => {
        if (!f.name.endsWith(".csv")) {
          return { file: f, status: "error" as const, error: "No es un archivo CSV" };
        }
        try {
          const text = await f.text();
          const parsed = parseCSV(text, f.name);
          return { file: f, status: "valid" as const, parsed };
        } catch (e: any) {
          return { file: f, status: "error" as const, error: e.message };
        }
      })
    );
    setFiles((prev) => {
      const existingNames = new Set(prev.map((e) => e.file.name));
      const newEntries = entries.filter((e) => !existingNames.has(e.file.name));
      return [...prev, ...newEntries];
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.file.name !== name));
  };

  const validFiles = files.filter((f) => f.status === "valid");

  return (
    <div
      style={{
        minHeight: "calc(100vh - 48px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#F5F0E8",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "48px", maxWidth: "560px" }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8A7D6A",
            marginBottom: "12px",
          }}
        >
          Análisis de Disponibilidad
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 900,
            fontSize: "clamp(32px, 5vw, 52px)",
            color: "#1A1208",
            lineHeight: 1.1,
            margin: "0 0 16px",
            letterSpacing: "-0.02em",
          }}
        >
          Store Availability
          <br />
          <span style={{ color: "#C8321A" }}>Intelligence</span>
        </h1>
        <p
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontWeight: 300,
            fontSize: "16px",
            color: "#8A7D6A",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Carga uno o más archivos CSV de disponibilidad de tiendas para generar
          un análisis completo con KPIs, gráficas y asistente de IA.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={dragging ? "dropzone-active" : ""}
        style={{
          width: "100%",
          maxWidth: "560px",
          border: `2px dashed ${dragging ? "#1A7A6E" : "#D4C8B0"}`,
          background: dragging ? "rgba(26,122,110,0.04)" : "#FDFAF4",
          padding: "48px 32px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 150ms ease-out",
          marginBottom: "24px",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
        <div
          style={{
            fontSize: "32px",
            marginBottom: "16px",
            opacity: 0.4,
          }}
        >
          ⬆
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#8A7D6A",
            marginBottom: "8px",
          }}
        >
          Arrastra archivos CSV aquí
        </div>
        <div
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontSize: "13px",
            color: "#CFC0A0",
          }}
        >
          o haz clic para seleccionar
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: "560px",
            border: "1px solid #D4C8B0",
            background: "#FDFAF4",
            marginBottom: "24px",
          }}
        >
          {files.map((entry, i) => (
            <div
              key={entry.file.name}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < files.length - 1 ? "1px solid #E8DFC8" : "none",
                gap: "12px",
              }}
            >
              {/* Status badge */}
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "9px",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  border: `1px solid ${entry.status === "valid" ? "#1A7A6E" : "#C8321A"}`,
                  color: entry.status === "valid" ? "#1A7A6E" : "#C8321A",
                  flexShrink: 0,
                }}
              >
                {entry.status === "valid" ? "Válido" : "Error"}
              </span>

              {/* File info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "12px",
                    color: "#1A1208",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.file.name}
                </div>
                {entry.status === "valid" && entry.parsed && (
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: "10px",
                      color: "#8A7D6A",
                      marginTop: "2px",
                    }}
                  >
                    {entry.parsed.metricName} · {formatNumber(entry.parsed.points.length)} pts
                  </div>
                )}
                {entry.status === "error" && (
                  <div
                    style={{
                      fontFamily: "'Source Serif 4', Georgia, serif",
                      fontSize: "11px",
                      color: "#C8321A",
                      marginTop: "2px",
                    }}
                  >
                    {entry.error}
                  </div>
                )}
              </div>

              {/* Remove */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(entry.file.name);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#CFC0A0",
                  fontSize: "16px",
                  lineHeight: 1,
                  padding: "0 4px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color = "#C8321A")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color = "#CFC0A0")
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Generate Button */}
      {validFiles.length > 0 && (
        <button
          onClick={() => onGenerate(validFiles)}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: "#1A1208",
            color: "#F5F0E8",
            border: "none",
            padding: "14px 40px",
            cursor: "pointer",
            transition: "all 150ms ease-out",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#C8321A";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#1A1208";
          }}
        >
          Generar Dashboard →
        </button>
      )}
    </div>
  );
}

// ─── API Key Modal ─────────────────────────────────────────────────────────────

function ApiKeyModal({
  onConfirm,
  onSkip,
}: {
  onConfirm: (key: string) => void;
  onSkip: () => void;
}) {
  const [key, setKey] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,18,8,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#FDFAF4",
          border: "1px solid #D4C8B0",
          width: "100%",
          maxWidth: "460px",
          padding: "32px",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8A7D6A",
            marginBottom: "8px",
          }}
        >
          Asistente IA
        </div>
        <h2
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            fontSize: "24px",
            color: "#1A1208",
            margin: "0 0 8px",
          }}
        >
          API Key de OpenRouter
        </h2>
        <p
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontWeight: 300,
            fontSize: "14px",
            color: "#8A7D6A",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          Ingresa tu API Key para habilitar el chatbot de análisis. Puedes
          obtenerla en{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#1A7A6E", textDecoration: "underline" }}
          >
            openrouter.ai/keys
          </a>
          .
        </p>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8A7D6A",
              marginBottom: "8px",
            }}
          >
            API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-or-..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && key.trim()) onConfirm(key.trim());
            }}
            style={{
              width: "100%",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "13px",
              padding: "10px 12px",
              border: "1px solid #D4C8B0",
              background: "#F5F0E8",
              color: "#1A1208",
              outline: "none",
              transition: "border-color 150ms ease-out",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = "#1A7A6E";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = "#D4C8B0";
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => key.trim() && onConfirm(key.trim())}
            disabled={!key.trim()}
            style={{
              flex: 1,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: key.trim() ? "#1A1208" : "#E8DFC8",
              color: key.trim() ? "#F5F0E8" : "#CFC0A0",
              border: "none",
              padding: "12px",
              cursor: key.trim() ? "pointer" : "not-allowed",
              transition: "all 150ms ease-out",
            }}
          >
            Activar Chat
          </button>
          <button
            onClick={onSkip}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: "none",
              color: "#8A7D6A",
              border: "1px solid #D4C8B0",
              padding: "12px 20px",
              cursor: "pointer",
              transition: "all 150ms ease-out",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#8A7D6A";
              (e.currentTarget as HTMLButtonElement).style.color = "#1A1208";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#D4C8B0";
              (e.currentTarget as HTMLButtonElement).style.color = "#8A7D6A";
            }}
          >
            Omitir
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chatbot ───────────────────────────────────────────────────────────────────

const QUICK_SUGGESTIONS = [
  "¿A qué hora hubo más tiendas?",
  "¿Hubo caídas significativas?",
  "Dame un resumen ejecutivo",
  "¿Cuándo fue el mínimo y por qué?",
];

function Chatbot({
  apiKey,
  systemPrompt,
}: {
  apiKey: string | null;
  systemPrompt: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading || !apiKey) return;
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": window.location.origin,
            "X-Title": "Rappi Store Intelligence",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-haiku",
            max_tokens: 800,
            messages: [
              { role: "system", content: systemPrompt },
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content: text },
            ],
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Error ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || "Sin respuesta.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error al conectar con OpenRouter: ${e.message}`,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [apiKey, messages, loading, systemPrompt]
  );

  const disabled = !apiKey;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#FDFAF4",
        borderLeft: "1px solid #D4C8B0",
      }}
    >
      {/* Chat header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #D4C8B0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#8A7D6A",
          }}
        >
          Asistente IA
        </span>
        {disabled && (
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "9px",
              color: "#CFC0A0",
              border: "1px solid #E8DFC8",
              padding: "1px 6px",
              letterSpacing: "0.08em",
            }}
          >
            DESACTIVADO
          </span>
        )}
        {!disabled && (
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "9px",
              color: "#1A7A6E",
              border: "1px solid #1A7A6E",
              padding: "1px 6px",
              letterSpacing: "0.08em",
            }}
          >
            ACTIVO
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.length === 0 && !disabled && (
          <div
            style={{
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontWeight: 300,
              fontSize: "13px",
              color: "#CFC0A0",
              textAlign: "center",
              marginTop: "24px",
              lineHeight: 1.6,
            }}
          >
            Haz una pregunta sobre los datos cargados o usa las sugerencias de abajo.
          </div>
        )}
        {messages.length === 0 && disabled && (
          <div
            style={{
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontWeight: 300,
              fontSize: "13px",
              color: "#CFC0A0",
              textAlign: "center",
              marginTop: "24px",
              lineHeight: 1.6,
            }}
          >
            El chat está desactivado. Recarga la página y proporciona una API Key de OpenRouter para habilitarlo.
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                background:
                  msg.role === "user"
                    ? "#1A1208"
                    : "#F5F0E8",
                color: msg.role === "user" ? "#F5F0E8" : "#1A1208",
                border: msg.role === "assistant" ? "1px solid #D4C8B0" : "none",
                fontFamily: "'Source Serif 4', Georgia, serif",
                fontSize: "13px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "12px 16px",
                background: "#F5F0E8",
                border: "1px solid #D4C8B0",
                display: "flex",
                gap: "5px",
                alignItems: "center",
              }}
            >
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {!disabled && (
        <div
          style={{
            padding: "12px 16px 0",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            flexShrink: 0,
          }}
        >
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              disabled={loading}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "10px",
                padding: "5px 10px",
                border: "1px solid #D4C8B0",
                background: "none",
                color: "#8A7D6A",
                cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
                transition: "all 150ms ease-out",
                opacity: loading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#E8DFC8";
                  (e.currentTarget as HTMLButtonElement).style.color = "#1A1208";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
                (e.currentTarget as HTMLButtonElement).style.color = "#8A7D6A";
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #D4C8B0",
          display: "flex",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder={disabled ? "Chat desactivado" : "Escribe una pregunta..."}
          disabled={disabled || loading}
          style={{
            flex: 1,
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontSize: "13px",
            padding: "8px 10px",
            border: "1px solid #D4C8B0",
            background: disabled ? "#F0EBE0" : "#F5F0E8",
            color: "#1A1208",
            outline: "none",
            transition: "border-color 150ms ease-out",
          }}
          onFocus={(e) => {
            if (!disabled)
              (e.currentTarget as HTMLInputElement).style.borderColor = "#1A7A6E";
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderColor = "#D4C8B0";
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={disabled || loading || !input.trim()}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px",
            fontWeight: 500,
            padding: "8px 14px",
            background:
              disabled || loading || !input.trim() ? "#E8DFC8" : "#1A1208",
            color:
              disabled || loading || !input.trim() ? "#CFC0A0" : "#F5F0E8",
            border: "none",
            cursor:
              disabled || loading || !input.trim() ? "not-allowed" : "pointer",
            transition: "all 150ms ease-out",
            flexShrink: 0,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Screen ──────────────────────────────────────────────────────────

function DashboardScreen({
  datasets,
  apiKey,
}: {
  datasets: ParsedCSV[];
  apiKey: string | null;
}) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const allPoints = useMemo(() => mergeDatasets(datasets), [datasets]);
  const filteredPoints = useMemo(
    () => filterByTimeRange(allPoints, timeFilter),
    [allPoints, timeFilter]
  );

  const kpis = useMemo(() => computeKPIs(filteredPoints), [filteredPoints]);
  const hourlyAvgs = useMemo(() => computeHourlyAverages(allPoints), [allPoints]);
  const tableRows = useMemo(() => computeTableRows(filteredPoints), [filteredPoints]);
  const sampledPoints = useMemo(() => samplePoints(filteredPoints), [filteredPoints]);
  const systemPrompt = useMemo(() => buildSystemPrompt(datasets, allPoints), [datasets, allPoints]);

  const lineData = useMemo(
    () =>
      sampledPoints.map((p) => ({
        t: formatTimestamp(p.timestamp),
        v: p.value,
      })),
    [sampledPoints]
  );

  const barData = useMemo(
    () =>
      hourlyAvgs.map((h) => ({
        h: `${String(h.hour).padStart(2, "0")}h`,
        avg: h.avg,
      })),
    [hourlyAvgs]
  );

  const TIME_FILTERS: { label: string; value: TimeFilter }[] = [
    { label: "Todo", value: "all" },
    { label: "0–8h", value: "0-8" },
    { label: "8–12h", value: "8-12" },
    { label: "12–18h", value: "12-18" },
    { label: "18–24h", value: "18-24" },
  ];

  const metricTitle = datasets.map((d) => d.metricName).join(" + ");

  return (
    <div style={{ display: "flex", height: "calc(100vh - 48px)", overflow: "hidden" }}>
      {/* ── Left Column ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          padding: "24px 28px",
          background: "#F5F0E8",
        }}
      >
        {/* Time Filters directly without metric title */}

        {/* Time Filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {TIME_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTimeFilter(f.value)}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "5px 12px",
                border: `1px solid ${timeFilter === f.value ? "#1A1208" : "#D4C8B0"}`,
                background: timeFilter === f.value ? "#1A1208" : "transparent",
                color: timeFilter === f.value ? "#F5F0E8" : "#8A7D6A",
                cursor: "pointer",
                transition: "all 150ms ease-out",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <SectionDivider label="Indicadores Clave" />
        {kpis && (
          <div
            style={{
              display: "flex",
              border: "1px solid #D4C8B0",
              background: "#FDFAF4",
              marginBottom: "24px",
              overflow: "hidden",
            }}
          >
            <KPICard
              label="Tiendas en Pico"
              value={formatNumber(kpis.peak.value)}
              sub={formatTimestamp(kpis.peak.timestamp)}
              accent="red"
            />
            <KPICard
              label="Promedio"
              value={formatNumber(kpis.average)}
              sub="tiendas visibles"
              accent="teal"
            />
            <KPICard
              label="Mínimo"
              value={formatNumber(kpis.minimum.value)}
              sub={formatTimestamp(kpis.minimum.timestamp)}
              accent="amber"
            />
            <div
              style={{
                flex: 1,
                minWidth: 0,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#8A7D6A",
                }}
              >
                Puntos de Datos
              </span>
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontWeight: 900,
                  fontSize: "42px",
                  lineHeight: 1,
                  color: "#1A1208",
                  letterSpacing: "-0.02em",
                }}
              >
                {formatNumber(kpis.totalPoints)}
              </span>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "10px",
                  color: "#8A7D6A",
                  marginTop: "2px",
                }}
              >
                {formatDate(kpis.rangeStart)} — {formatDate(kpis.rangeEnd)}
              </span>
            </div>
          </div>
        )}

        {/* Line Chart */}
        <SectionDivider label="Evolución Temporal" />
        <div
          style={{
            background: "#FDFAF4",
            border: "1px solid #D4C8B0",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8DFC8" vertical={false} />
              <XAxis
                dataKey="t"
                tick={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  fill: "#8A7D6A",
                }}
                tickLine={false}
                axisLine={{ stroke: "#D4C8B0" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  fill: "#8A7D6A",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="v"
                stroke="#1A7A6E"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: "#1A7A6E", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <SectionDivider label="Promedio por Hora del Día" />
        <div
          style={{
            background: "#FDFAF4",
            border: "1px solid #D4C8B0",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "9px",
              color: "#CFC0A0",
              marginBottom: "8px",
              letterSpacing: "0.08em",
            }}
          >
            Calculado sobre todos los datos (sin filtro de rango)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8DFC8" vertical={false} />
              <XAxis
                dataKey="h"
                tick={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  fill: "#8A7D6A",
                }}
                tickLine={false}
                axisLine={{ stroke: "#D4C8B0" }}
              />
              <YAxis
                tick={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  fill: "#8A7D6A",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avg" fill="#D4820A" radius={[1, 1, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Events Table */}
        <SectionDivider label="Eventos Destacados" />
        <div
          style={{
            background: "#FDFAF4",
            border: "1px solid #D4C8B0",
            marginBottom: "32px",
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 80px 80px 1fr",
              padding: "8px 16px",
              borderBottom: "1px solid #D4C8B0",
              background: "#F5F0E8",
            }}
          >
            {["Timestamp", "Tiendas", "Variación", "Estado", "Nota"].map((h) => (
              <span
                key={h}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "9px",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#8A7D6A",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {tableRows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 80px 80px 1fr",
                padding: "10px 16px",
                borderBottom: i < tableRows.length - 1 ? "1px solid #E8DFC8" : "none",
                alignItems: "center",
                transition: "background 150ms ease-out",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "#F5F0E8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {/* Timestamp */}
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "11px",
                  color: "#8A7D6A",
                }}
              >
                {formatTimestamp(row.timestamp)}
              </span>

              {/* Value */}
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "#1A1208",
                }}
              >
                {formatNumber(row.value)}
              </span>

              {/* Variation */}
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "11px",
                  color:
                    row.variation > 0
                      ? "#1A7A6E"
                      : row.variation < 0
                      ? "#C8321A"
                      : "#8A7D6A",
                }}
              >
                {row.variation > 0 ? "+" : ""}
                {row.variation}%
              </span>

              {/* Status badge */}
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "9px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  padding: "2px 6px",
                  border: `1px solid ${
                    row.status === "PEAK"
                      ? "#1A7A6E"
                      : row.status === "MÍNIMO"
                      ? "#C8321A"
                      : "#D4C8B0"
                  }`,
                  color:
                    row.status === "PEAK"
                      ? "#1A7A6E"
                      : row.status === "MÍNIMO"
                      ? "#C8321A"
                      : "#8A7D6A",
                  display: "inline-block",
                  width: "fit-content",
                }}
              >
                {row.status}
              </span>

              {/* Note */}
              <span
                style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontWeight: 300,
                  fontSize: "12px",
                  color: "#8A7D6A",
                  fontStyle: "italic",
                }}
              >
                {row.note}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Column: Chatbot ── */}
      <div style={{ width: "340px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <Chatbot apiKey={apiKey} systemPrompt={systemPrompt} />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileEntry[]>([]);
  const [activeDatasets, setActiveDatasets] = useState<ParsedCSV[]>([]);

  const totalPoints = useMemo(
    () =>
      activeDatasets.reduce((sum, d) => sum + d.points.length, 0) || null,
    [activeDatasets]
  );

  const handleGenerate = useCallback((files: FileEntry[]) => {
    setPendingFiles(files);
    setShowApiModal(true);
  }, []);

  const handleApiConfirm = useCallback(
    (key: string) => {
      setApiKey(key);
      setShowApiModal(false);
      const datasets = pendingFiles
        .filter((f) => f.parsed)
        .map((f) => f.parsed!);
      setActiveDatasets(datasets);
      setScreen("dashboard");
    },
    [pendingFiles]
  );

  const handleApiSkip = useCallback(() => {
    setApiKey(null);
    setShowApiModal(false);
    const datasets = pendingFiles
      .filter((f) => f.parsed)
      .map((f) => f.parsed!);
    setActiveDatasets(datasets);
    setScreen("dashboard");
  }, [pendingFiles]);

  const handleReset = useCallback(() => {
    setScreen("upload");
    setActiveDatasets([]);
    setPendingFiles([]);
    setApiKey(null);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8" }}>
      <TopBar
        pointCount={screen === "dashboard" ? totalPoints : null}
        onReset={screen === "dashboard" ? handleReset : () => {}}
      />

      {screen === "upload" && <UploadScreen onGenerate={handleGenerate} />}

      {screen === "dashboard" && activeDatasets.length > 0 && (
        <DashboardScreen datasets={activeDatasets} apiKey={apiKey} />
      )}

      {showApiModal && (
        <ApiKeyModal onConfirm={handleApiConfirm} onSkip={handleApiSkip} />
      )}
    </div>
  );
}
