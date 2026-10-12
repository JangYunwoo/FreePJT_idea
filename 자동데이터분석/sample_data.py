"""Generate deterministic, synthetic order data for the demo."""

import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
COLUMNS = [
    "order_id", "ordered_at", "channel", "region", "product_group",
    "unit_price", "quantity", "discount_pct", "shipping_days", "returned", "revenue",
]


def make_rows() -> tuple[list[dict[str, object]], dict[str, object]]:
    rng = random.Random(20261012)
    products = {"desk": 92000, "lamp": 46000, "chair": 154000, "storage": 71000}
    channels = ["web", "app", "store"]
    regions = ["Seoul", "Gyeonggi", "Busan", "Daejeon", "Daegu"]
    rows: list[dict[str, object]] = []
    for index in range(420):
        product = rng.choice(list(products))
        price = round(products[product] * rng.uniform(0.83, 1.18))
        quantity = rng.choices([1, 2, 3, 4, 5], weights=[44, 28, 16, 8, 4])[0]
        discount = rng.choice([0, 0, 0, 5, 10, 15, 20])
        shipping = rng.choices([1, 2, 3, 4, 5, 6, 7], weights=[8, 20, 29, 20, 12, 7, 4])[0]
        if index in (57, 122, 289, 304):
            if index == 57:
                price = 1_890_000
            elif index == 122:
                shipping = 31
            elif index == 289:
                quantity = 42
            elif index == 304:
                discount = 85
        returned = int(rng.random() < (0.08 + (0.19 if shipping >= 6 else 0)))
        region = "" if index in (9, 29, 68, 105, 178, 232, 299, 366) else rng.choice(regions)
        rows.append({
            "order_id": f"ORD-{index + 1:04d}",
            "ordered_at": (date(2026, 8, 1) + timedelta(days=rng.randrange(60))).isoformat(),
            "channel": rng.choice(channels),
            "region": region,
            "product_group": product,
            "unit_price": price,
            "quantity": quantity,
            "discount_pct": discount,
            "shipping_days": shipping,
            "returned": returned,
            "revenue": round(price * quantity * (1 - discount / 100)),
        })
    rows.append(dict(rows[84]))
    truth = {
        "description": "합성 주문 데이터. 실제 고객 데이터가 아닙니다.",
        "injected_anomaly_ids": ["ORD-0058", "ORD-0123", "ORD-0290", "ORD-0305"],
        "blank_region_rows": 8,
        "duplicate_rows": 1,
        "note": "비지도 이상탐지의 결과가 주입 정답과 반드시 일치하는 것은 아닙니다.",
    }
    return rows, truth


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows, truth = make_rows()
    with (DATA_DIR / "demo_orders.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (DATA_DIR / "demo_truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Created {len(rows)} synthetic rows in {DATA_DIR}")


if __name__ == "__main__":
    main()

