"""Evidence-first analysis built on DuckDB, PyOD and fg-data-profiling."""

from __future__ import annotations

from io import BytesIO
from math import isfinite
from typing import Any

import duckdb
import numpy as np
import pandas as pd
from pyod.models.iforest import IForest
from sklearn.preprocessing import RobustScaler


class AnalysisError(ValueError):
    """A CSV cannot be safely or meaningfully analysed by this demo."""


MAX_ROWS = 20_000
MAX_COLUMNS = 60


def load_csv(content: bytes) -> pd.DataFrame:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "cp949"):
        try:
            frame = pd.read_csv(BytesIO(content), encoding=encoding, low_memory=False)
            break
        except UnicodeDecodeError as exc:
            last_error = exc
        except (pd.errors.ParserError, pd.errors.EmptyDataError, ValueError) as exc:
            raise AnalysisError(f"CSV를 읽을 수 없습니다: {exc}") from exc
    else:
        raise AnalysisError("UTF-8 또는 CP949 인코딩의 CSV가 필요합니다.") from last_error

    if frame.empty or not len(frame.columns):
        raise AnalysisError("데이터 행과 열이 모두 필요합니다.")
    if len(frame) > MAX_ROWS or len(frame.columns) > MAX_COLUMNS:
        raise AnalysisError(f"데모는 최대 {MAX_ROWS:,}행, {MAX_COLUMNS}열까지 분석합니다.")
    frame.columns = [str(column).strip() or f"column_{index + 1}" for index, column in enumerate(frame.columns)]
    return frame


def json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return round(float(value), 5) if isfinite(float(value)) else None
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if pd.isna(value):
        return None
    return str(value)


def safe_row(row: pd.Series) -> dict[str, Any]:
    return {str(key): json_value(value) for key, value in row.items()}


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def classify_column(series: pd.Series, name: str) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "category"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if "date" in name.lower() or "time" in name.lower() or name.lower().endswith("_at"):
        parsed = pd.to_datetime(series, errors="coerce")
        if parsed.notna().sum() >= max(2, int(series.notna().sum() * 0.8)):
            return "date"
    return "category"


def numeric_chart(series: pd.Series) -> dict[str, Any]:
    values = pd.to_numeric(series, errors="coerce").dropna().to_numpy(dtype=float)
    values = values[np.isfinite(values)]
    if not len(values):
        return {"kind": "empty", "labels": [], "values": [], "note": ""}
    if np.min(values) == np.max(values):
        return {"kind": "bar", "labels": [f"{values[0]:,.2f}"], "values": [len(values)], "note": ""}
    note = ""
    working = values
    lower, upper = float(np.min(values)), float(np.max(values))
    if len(values) >= 30:
        q01, q99 = np.quantile(values, [0.01, 0.99])
        spread = q99 - q01
        if spread > 0 and (lower < q01 - 0.5 * spread or upper > q99 + 0.5 * spread):
            working = values[(values >= q01) & (values <= q99)]
            lower, upper = float(q01), float(q99)
            note = "극단값은 양끝 구간으로 분리"
    counts, edges = np.histogram(working, bins=min(8, max(4, int(np.sqrt(len(working))))), range=(lower, upper))
    labels = [f"{edges[i]:,.1f}–{edges[i + 1]:,.1f}" for i in range(len(counts))]
    amounts = counts.astype(int).tolist()
    if note:
        below = int((values < lower).sum())
        above = int((values > upper).sum())
        if below:
            labels.insert(0, f"{lower:,.1f} 미만")
            amounts.insert(0, below)
        if above:
            labels.append(f"{upper:,.1f} 초과")
            amounts.append(above)
    return {"kind": "histogram", "labels": labels, "values": amounts, "note": note}


def category_chart(connection: duckdb.DuckDBPyConnection, name: str) -> dict[str, Any]:
    quoted = quote_identifier(name)
    query = (
        f"SELECT COALESCE(CAST({quoted} AS VARCHAR), '(비어 있음)') AS label, "
        f"COUNT(*) AS amount FROM dataset GROUP BY 1 ORDER BY amount DESC LIMIT 8"
    )
    records = connection.execute(query).fetchall()
    return {
        "kind": "bar",
        "labels": [str(label) for label, _ in records],
        "values": [int(amount) for _, amount in records],
    }


def find_anomalies(frame: pd.DataFrame) -> tuple[list[dict[str, Any]], int, list[str]]:
    usable = []
    for name in frame.select_dtypes(include="number").columns:
        series = frame[name]
        lower = name.lower()
        if lower == "id" or lower.endswith("_id") or series.nunique(dropna=True) < 8:
            continue
        usable.append(name)
    if len(frame) < 30 or len(usable) < 2:
        return [], 0, []

    usable = usable[:12]
    numeric = frame[usable].replace([np.inf, -np.inf], np.nan)
    numeric = numeric.fillna(numeric.median()).fillna(0)
    scaled = RobustScaler().fit_transform(numeric)
    detector = IForest(contamination=0.05, random_state=42, n_estimators=160)
    detector.fit(scaled)
    scores = detector.decision_function(scaled)
    flags = detector.labels_.astype(bool)
    flagged = np.flatnonzero(flags)
    ranked = sorted(flagged, key=lambda index: float(scores[index]), reverse=True)[:8]
    rows = [
        {
            "row_number": int(index + 2),
            "score": round(float(scores[index]), 3),
            "values": safe_row(frame.iloc[int(index)]),
        }
        for index in ranked
    ]
    return rows, int(flags.sum()), usable


def top_correlations(frame: pd.DataFrame) -> list[dict[str, Any]]:
    numeric = frame.select_dtypes(include="number")
    numeric = numeric.loc[:, [name for name in numeric.columns if numeric[name].nunique(dropna=True) >= 8]]
    if numeric.shape[1] < 2:
        return []
    correlations = numeric.corr(numeric_only=True)
    pairs = []
    for left_index, left in enumerate(correlations.columns):
        for right in correlations.columns[left_index + 1 :]:
            value = correlations.loc[left, right]
            if pd.notna(value) and abs(value) >= 0.6:
                pairs.append({"left": left, "right": right, "coefficient": round(float(value), 3)})
    return sorted(pairs, key=lambda item: abs(item["coefficient"]), reverse=True)[:5]


def make_insights(
    frame: pd.DataFrame,
    anomalies: list[dict[str, Any]],
    anomaly_total: int,
    correlations: list[dict[str, Any]],
) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []
    missing = frame.isna().sum().sort_values(ascending=False)
    if len(missing) and int(missing.iloc[0]) > 0:
        column = str(missing.index[0])
        count = int(missing.iloc[0])
        insights.append({
            "type": "품질",
            "title": f"'{column}'에 빈 값이 있습니다",
            "detail": f"{count:,}개 행({count / len(frame):.1%})에서 값이 비어 있습니다. 이 열을 기준으로 비교하기 전에 확인이 필요합니다.",
            "evidence": f"결측 행 {count:,}개",
        })
    duplicates = int(frame.duplicated().sum())
    if duplicates:
        insights.append({
            "type": "품질",
            "title": "완전히 같은 행이 반복됩니다",
            "detail": f"중복 행 {duplicates:,}개를 찾았습니다. 집계 결과를 왜곡하는 중복 입력인지 확인해 보세요.",
            "evidence": f"중복 행 {duplicates:,}개",
        })
    if anomaly_total:
        insights.append({
            "type": "AI 탐지",
            "title": "일반적인 패턴에서 벗어난 행이 있습니다",
            "detail": "Isolation Forest가 여러 수치 열을 함께 비교해 확인이 필요한 행을 골랐습니다. 이상치가 곧 오류라는 뜻은 아닙니다.",
            "evidence": f"후보 {anomaly_total:,}개 · 상위 {len(anomalies)}개 표시",
        })
    if correlations:
        first = correlations[0]
        insights.append({
            "type": "관계",
            "title": f"'{first['left']}'와 '{first['right']}'가 함께 변합니다",
            "detail": "두 수치 열 사이의 상관관계를 발견했습니다. 원인·결과 관계를 뜻하지는 않습니다.",
            "evidence": f"상관계수 {first['coefficient']:+.2f}",
        })
    if not insights:
        insights.append({
            "type": "개요",
            "title": "큰 품질 문제는 발견되지 않았습니다",
            "detail": "눈에 띄는 결측·중복·강한 상관관계가 없습니다. 열별 분포를 탐색해 보세요.",
            "evidence": f"{len(frame):,}행 점검",
        })
    return insights[:4]


def analyze_csv(content: bytes, filename: str) -> dict[str, Any]:
    frame = load_csv(content)
    connection = duckdb.connect(database=":memory:")
    try:
        connection.register("dataset", frame)
        row_count = int(connection.execute("SELECT COUNT(*) FROM dataset").fetchone()[0])
        columns = []
        for name in frame.columns:
            series = frame[name]
            kind = classify_column(series, name)
            chart = numeric_chart(series) if kind == "number" else category_chart(connection, name)
            columns.append({
                "name": name,
                "kind": kind,
                "missing": int(series.isna().sum()),
                "unique": int(series.nunique(dropna=True)),
                "chart": chart,
            })
        anomalies, anomaly_total, anomaly_features = find_anomalies(frame)
        correlations = top_correlations(frame)
        result = {
            "filename": filename,
            "summary": {
                "rows": row_count,
                "columns": len(frame.columns),
                "missing_cells": int(frame.isna().sum().sum()),
                "duplicate_rows": int(frame.duplicated().sum()),
                "anomaly_rows": anomaly_total,
            },
            "insights": make_insights(frame, anomalies, anomaly_total, correlations),
            "columns": columns,
            "correlations": correlations,
            "anomalies": anomalies,
            "anomaly_features": anomaly_features,
            "preview": [safe_row(row) for _, row in frame.head(12).iterrows()],
            "engines": ["DuckDB", "PyOD / Isolation Forest" if anomaly_features else "PyOD / 조건 미충족"],
        }
        return result
    finally:
        connection.close()


def build_profile_html(content: bytes, filename: str) -> str:
    from data_profiling import ProfileReport

    frame = load_csv(content)
    if len(frame) > 5_000:
        frame = frame.sample(5_000, random_state=42)
    report = ProfileReport(frame, title=f"{filename} — 데이터 프로파일", minimal=True, progress_bar=False)
    return report.to_html()
