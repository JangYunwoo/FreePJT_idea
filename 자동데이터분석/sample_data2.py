"""Generate a larger, deterministic second CSV with a different order schema."""

import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
COLUMNS = [
    "purchase_key",
    "purchase_day",
    "platform",
    "membership_tier",
    "cart_value_krw",
    "shipping_distance_km",
    "packing_minutes",
    "delivery_hours",
    "cancelled",
]


def make_rows(count: int = 600) -> tuple[list[dict[str, object]], dict[str, object]]:
    rng = random.Random(20261012)
    tier_bases = {"basic": 42_000, "standard": 70_000, "premium": 115_000}
    rows: list[dict[str, object]] = []
    missing_tiers = {9, 61, 106, 178, 237, 319, 401, 455, 502, 574}

    for index in range(count):
        tier = rng.choices(["basic", "standard", "premium"], weights=[36, 45, 19])[0]
        cart = round(max(15_000, rng.gauss(tier_bases[tier], tier_bases[tier] * 0.34)), -2)
        distance = round(rng.uniform(1.2, 19.8), 1)
        packing = max(8, round(rng.gauss(17 + cart / 7_000, 5)))
        delivery = round(max(2.0, 2.0 + distance * 0.91 + rng.gauss(0, 2.0)), 1)

        # Deliberate edge cases make it possible to check an unsupervised model.
        if index == 17:
            cart = 980_000
        elif index == 33:
            distance, packing, delivery = 145.4, 215, 72.0
        elif index == 149:
            packing = 176
        elif index == 377:
            delivery = 61.5
        elif index == 520:
            cart = 760_000

        rows.append({
            "purchase_key": f"P-{index + 2001}",
            "purchase_day": (date(2026, 9, 1) + timedelta(days=rng.randrange(42))).isoformat(),
            "platform": rng.choices(["app", "web", "kiosk"], weights=[47, 42, 11])[0],
            "membership_tier": "" if index in missing_tiers else tier,
            "cart_value_krw": cart,
            "shipping_distance_km": distance,
            "packing_minutes": packing,
            "delivery_hours": delivery,
            "cancelled": int(rng.random() < (0.18 if delivery > 30 else 0.06)),
        })

    rows.append(dict(rows[84]))
    truth = {
        "description": "합성 주문 데이터. 실제 고객 데이터가 아닙니다.",
        "injected_anomaly_ids": ["P-2018", "P-2034", "P-2150", "P-2378", "P-2521"],
        "blank_membership_rows": len(missing_tiers),
        "duplicate_rows": 1,
        "note": "비지도 이상탐지 결과와 주입한 예외 행은 반드시 일치하지 않습니다.",
    }
    return rows, truth


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows, truth = make_rows()
    with (DATA_DIR / "demo_orders2.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (DATA_DIR / "demo_orders2_truth.json").write_text(
        json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Created {len(rows)} synthetic rows in {DATA_DIR}")


if __name__ == "__main__":
    main()
