import csv
from io import StringIO
import unittest

from fastapi.testclient import TestClient

from analysis import AnalysisError, analyze_csv
from app import app
from sample_data import COLUMNS, make_rows


def sample_bytes() -> bytes:
    rows, _ = make_rows()
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


class AnalysisTests(unittest.TestCase):
    def test_sample_has_expected_findings(self) -> None:
        result = analyze_csv(sample_bytes(), "demo_orders.csv")
        self.assertEqual(result["summary"]["rows"], 421)
        self.assertEqual(result["summary"]["duplicate_rows"], 1)
        self.assertGreaterEqual(result["summary"]["missing_cells"], 8)
        self.assertGreater(result["summary"]["anomaly_rows"], 0)
        self.assertTrue(result["insights"])
        self.assertIn("PyOD / Isolation Forest", result["engines"])
        price_chart = next(column["chart"] for column in result["columns"] if column["name"] == "unit_price")
        self.assertIn("극단값", price_chart["note"])
        self.assertEqual(sum(price_chart["values"]), 421)

    def test_empty_csv_is_rejected(self) -> None:
        with self.assertRaises(AnalysisError):
            analyze_csv(b"", "empty.csv")

    def test_upload_api_and_home(self) -> None:
        client = TestClient(app)
        self.assertEqual(client.get("/").status_code, 200)
        self.assertEqual(client.get("/api/health").json()["status"], "ok")
        response = client.post(
            "/api/analyze",
            files={"file": ("demo_orders.csv", sample_bytes(), "text/csv")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["rows"], 421)

    def test_upload_restrictions(self) -> None:
        client = TestClient(app)
        wrong_type = client.post("/api/analyze", files={"file": ("data.txt", b"x", "text/plain")})
        self.assertEqual(wrong_type.status_code, 400)
        too_large = client.post("/api/analyze", files={"file": ("data.csv", b"x" * (8 * 1024 * 1024 + 1), "text/csv")})
        self.assertEqual(too_large.status_code, 413)


if __name__ == "__main__":
    unittest.main()
