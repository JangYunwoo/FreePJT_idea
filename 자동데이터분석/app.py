"""Local-network demo server for the upload-based data analysis service."""

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from analysis import AnalysisError, analyze_csv, build_profile_html


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SAMPLE_FILE = BASE_DIR / "data" / "demo_orders.csv"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Signal — 데이터 자동분석 데모", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "local-demo"}


@app.get("/api/sample")
def sample() -> FileResponse:
    return FileResponse(SAMPLE_FILE, media_type="text/csv", filename="demo_orders.csv")


async def read_csv_upload(file: UploadFile) -> bytes:
    if not file.filename or Path(file.filename).suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="CSV 파일만 업로드할 수 있습니다.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일은 분석할 수 없습니다.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="파일 크기는 8MB 이하로 제한됩니다.")
    return content


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)) -> JSONResponse:
    content = await read_csv_upload(file)
    try:
        result = analyze_csv(content, file.filename or "data.csv")
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


@app.post("/api/profile")
async def profile(file: UploadFile = File(...)) -> HTMLResponse:
    content = await read_csv_upload(file)
    try:
        html = build_profile_html(content, file.filename or "data.csv")
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'attachment; filename="data-profile.html"',
        },
    )

