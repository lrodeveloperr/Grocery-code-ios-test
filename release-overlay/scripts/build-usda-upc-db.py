#!/usr/bin/env python3
"""Build the Grocery Benefits Tracker's compact, offline USDA UPC index.

The source archive is the public-domain USDA FoodData Central branded-food CSV
release.  Only current US grocery lookup data is retained.  Nutrition,
ingredients, images, package metadata, prices, and SNAP eligibility are never
copied into the application database.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import unicodedata
import zipfile
from collections.abc import Iterable
from pathlib import Path


SOURCE_NAME = "USDA FoodData Central Global Branded Food Products Database"
SOURCE_LICENSE = "CC0 1.0 / US public domain"
SUPPORTED_MARKET = "United States"
SCHEMA_VERSION = 1
MAX_PRODUCT_NAME_LENGTH = 72

CATEGORY_IDS = {
    "other": 0,
    "produce": 1,
    "protein": 2,
    "dairy": 3,
    "grains": 4,
    "pantry": 5,
    "frozen": 6,
    "beverages": 7,
    "prepared": 8,
    "snacks": 9,
    "baby": 10,
}

# These categories are clearly outside a grocery spending tracker or identify
# products that are not SNAP food (for example, Supplement Facts products).
# Ordinary food such as soda and candy remains present: the app tracks what the
# user selects and never claims that a UPC proves SNAP eligibility.
EXCLUDED_CATEGORY_TERMS = (
    "alcohol",
    "beer",
    "supplement",
    "vitamin",
    "mineral",
    "health care",
    "oral hygiene",
    "skin care",
    "childcare",
    "natural remedies",
    "home decoration",
    "kitchen supplies",
    "gardening",
    "media",
    "weight control",
    "tobacco",
)

FROZEN_TERMS = ("frozen", "ice cream", "ice novelty", "ice novelties")
BABY_TERMS = ("baby", "infant")
BEVERAGE_TERMS = (
    "beverage",
    "drink",
    "juice",
    "water",
    "soda",
    "coffee",
    "tea",
)
DAIRY_TERMS = ("milk", "cheese", "yogurt", "butter", "cream", "egg")
PROTEIN_TERMS = (
    "meat",
    "poultry",
    "chicken",
    "turkey",
    "beef",
    "pork",
    "fish",
    "seafood",
    "shellfish",
    "sausage",
    "hotdog",
    "bacon",
    "tuna",
    "nut",
    "seed",
    "bean",
    "lentil",
)
GRAIN_TERMS = (
    "bread",
    "bun",
    "cereal",
    "pasta",
    "noodle",
    "rice",
    "grain",
    "flour",
    "corn meal",
    "pancake",
    "waffle",
    "dough",
    "crust",
)
PRODUCE_TERMS = ("fruit", "vegetable", "produce", "tomato", "pepper")
PANTRY_TERMS = (
    "oil",
    "vinegar",
    "sauce",
    "condiment",
    "seasoning",
    "spice",
    "extract",
    "baking",
    "sugar",
    "syrup",
    "molasses",
    "honey",
    "jam",
    "jelly",
    "spread",
    "pickle",
    "relish",
    "olive",
    "mayonnaise",
    "dressing",
    "gelatin",
)
SNACK_TERMS = (
    "snack",
    "candy",
    "chocolate",
    "cookie",
    "biscuit",
    "chip",
    "popcorn",
    "cracker",
    "cake",
    "cupcake",
    "pastry",
    "dessert",
    "pudding",
    "custard",
    "gum",
    "mint",
)
PREPARED_TERMS = (
    "prepared",
    "meal",
    "dinner",
    "entree",
    "soup",
    "pizza",
    "sandwich",
    "wrap",
    "burrito",
    "sushi",
    "deli",
    "chili",
    "stew",
)


def normalized_text(value: str | None, limit: int) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit].rstrip()


def product_display_name(value: str | None) -> str:
    name = normalized_text(value, MAX_PRODUCT_NAME_LENGTH)
    letters = [character for character in name if character.isalpha()]
    if letters and all(character.isupper() for character in letters):
        name = name.title()
        name = re.sub(r"'S\b", "'s", name)
        for ordinary, preferred in (
            ("Bbq", "BBQ"),
            ("Usda", "USDA"),
            ("Usa", "USA"),
        ):
            name = re.sub(rf"\b{ordinary}\b", preferred, name)
    return name


def check_digit(body: str) -> str:
    total = 0
    weight = 3
    for digit in reversed(body):
        total += int(digit) * weight
        weight = 1 if weight == 3 else 3
    return str((10 - (total % 10)) % 10)


def normalize_gtin(value: str | None) -> int | None:
    code = re.sub(r"\D", "", value or "")
    if len(code) not in (8, 12, 13, 14) or set(code) == {"0"}:
        return None
    if check_digit(code[:-1]) != code[-1]:
        return None
    # FoodData Central stores canonical EAN/UPC/GTIN identifiers.  Eight-digit
    # source identifiers are EAN-8 here; UPC-E expansion is handled by the
    # native scanner because its symbology is known at scan time.
    return int(code.zfill(14))


def is_relevant_category(category: str) -> bool:
    lowered = category.casefold()
    return not any(term in lowered for term in EXCLUDED_CATEGORY_TERMS)


def broad_category(category: str) -> int:
    lowered = category.casefold()
    groups: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("baby", BABY_TERMS),
        ("frozen", FROZEN_TERMS),
        ("beverages", BEVERAGE_TERMS),
        ("snacks", SNACK_TERMS),
        ("grains", GRAIN_TERMS),
        ("protein", PROTEIN_TERMS),
        ("dairy", DAIRY_TERMS),
        ("prepared", PREPARED_TERMS),
        ("pantry", PANTRY_TERMS),
        ("produce", PRODUCE_TERMS),
    )
    for category_id, terms in groups:
        if any(term in lowered for term in terms):
            return CATEGORY_IDS[category_id]
    return CATEGORY_IDS["pantry"]


def archive_member(archive: zipfile.ZipFile, suffix: str) -> str:
    matches = [name for name in archive.namelist() if name.endswith(suffix)]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {suffix} member; found {len(matches)}")
    return matches[0]


def csv_rows(archive: zipfile.ZipFile, member: str) -> Iterable[dict[str, str]]:
    with archive.open(member) as raw:
        with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text)


def database_connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA journal_mode=OFF")
    connection.execute("PRAGMA synchronous=OFF")
    connection.execute("PRAGMA temp_store=MEMORY")
    connection.execute("PRAGMA locking_mode=EXCLUSIVE")
    connection.execute("PRAGMA page_size=4096")
    return connection


def batched_insert(
    connection: sqlite3.Connection,
    sql: str,
    values: list[tuple[object, ...]],
) -> None:
    if not values:
        return
    connection.executemany(sql, values)
    connection.commit()
    values.clear()


def build_database(source_zip: Path, output: Path, release: str) -> dict[str, object]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".building")
    temporary.unlink(missing_ok=True)
    connection = database_connection(temporary)

    counts = {
        "food_rows": 0,
        "us_food_names": 0,
        "branded_rows": 0,
        "us_branded_rows": 0,
        "invalid_gtin": 0,
        "excluded_category": 0,
    }

    try:
        connection.executescript(
            """
            CREATE TABLE food_names (
              fdc_id INTEGER PRIMARY KEY,
              name TEXT NOT NULL
            );
            CREATE TABLE candidates (
              gtin INTEGER PRIMARY KEY,
              fdc_id INTEGER NOT NULL,
              category INTEGER NOT NULL,
              record_date TEXT NOT NULL,
              discontinued INTEGER NOT NULL
            );
            """
        )

        with zipfile.ZipFile(source_zip) as archive:
            food_member = archive_member(archive, "/food.csv")
            name_batch: list[tuple[object, ...]] = []
            for row in csv_rows(archive, food_member):
                counts["food_rows"] += 1
                if (
                    row.get("data_type") != "branded_food"
                    or row.get("market_country") != SUPPORTED_MARKET
                ):
                    continue
                name = product_display_name(row.get("description"))
                if not name:
                    continue
                name_batch.append((int(row["fdc_id"]), name))
                counts["us_food_names"] += 1
                if len(name_batch) >= 20_000:
                    batched_insert(
                        connection,
                        "INSERT OR REPLACE INTO food_names(fdc_id,name) VALUES (?,?)",
                        name_batch,
                    )
            batched_insert(
                connection,
                "INSERT OR REPLACE INTO food_names(fdc_id,name) VALUES (?,?)",
                name_batch,
            )

            branded_member = archive_member(archive, "/branded_food.csv")
            candidate_batch: list[tuple[object, ...]] = []
            upsert = """
                INSERT INTO candidates(
                  gtin,fdc_id,category,record_date,discontinued
                ) VALUES (?,?,?,?,?)
                ON CONFLICT(gtin) DO UPDATE SET
                  fdc_id=excluded.fdc_id,
                  category=excluded.category,
                  record_date=excluded.record_date,
                  discontinued=excluded.discontinued
                WHERE excluded.record_date > candidates.record_date
                   OR (
                     excluded.record_date = candidates.record_date
                     AND excluded.fdc_id > candidates.fdc_id
                   )
            """
            for row in csv_rows(archive, branded_member):
                counts["branded_rows"] += 1
                if row.get("market_country") != SUPPORTED_MARKET:
                    continue
                counts["us_branded_rows"] += 1
                gtin = normalize_gtin(row.get("gtin_upc"))
                if gtin is None:
                    counts["invalid_gtin"] += 1
                    continue
                category = normalized_text(row.get("branded_food_category"), 256)
                if not is_relevant_category(category):
                    counts["excluded_category"] += 1
                    continue
                dates = [
                    value
                    for value in (
                        row.get("modified_date"),
                        row.get("available_date"),
                        row.get("discontinued_date"),
                    )
                    if value
                ]
                record_date = max(dates, default="0000-00-00")
                candidate_batch.append(
                    (
                        gtin,
                        int(row["fdc_id"]),
                        broad_category(category),
                        record_date,
                        1 if row.get("discontinued_date") else 0,
                    )
                )
                if len(candidate_batch) >= 20_000:
                    batched_insert(connection, upsert, candidate_batch)
            batched_insert(connection, upsert, candidate_batch)

        connection.executescript(
            """
            CREATE TABLE products (
              gtin INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              category INTEGER NOT NULL
            );
            INSERT INTO products(gtin,name,category)
              SELECT candidates.gtin, food_names.name, candidates.category
              FROM candidates
              JOIN food_names ON food_names.fdc_id = candidates.fdc_id
              WHERE candidates.discontinued = 0;
            CREATE TABLE categories (
              id INTEGER PRIMARY KEY,
              name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            ) WITHOUT ROWID;
            DROP TABLE candidates;
            DROP TABLE food_names;
            """
        )
        connection.executemany(
            "INSERT INTO categories(id,name) VALUES (?,?)",
            sorted((identifier, name) for name, identifier in CATEGORY_IDS.items()),
        )
        product_count = connection.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        metadata = {
            "schema_version": str(SCHEMA_VERSION),
            "source": SOURCE_NAME,
            "source_license": SOURCE_LICENSE,
            "source_release": release,
            "market_country": SUPPORTED_MARKET,
            "product_count": str(product_count),
            "eligibility_authority": "none",
            "filter_counts": json.dumps(counts, sort_keys=True, separators=(",", ":")),
        }
        connection.executemany(
            "INSERT INTO metadata(key,value) VALUES (?,?)", metadata.items()
        )
        connection.commit()
        connection.execute("PRAGMA optimize")
        connection.execute("VACUUM")
        connection.close()
        os.replace(temporary, output)
    except BaseException:
        connection.close()
        temporary.unlink(missing_ok=True)
        raise

    result = {
        "output": str(output),
        "bytes": output.stat().st_size,
        "products": product_count,
        "source_release": release,
        "counts": counts,
    }
    return result


def self_test() -> None:
    assert check_digit("03600029145") == "2"
    assert normalize_gtin("036000291452") == 36000291452
    assert normalize_gtin("00036000291452") == 36000291452
    assert normalize_gtin("00000000000000") is None
    assert normalize_gtin("036000291453") is None
    assert is_relevant_category("Canned Vegetables")
    assert not is_relevant_category("Herbal Supplements")
    assert broad_category("Frozen Vegetables") == CATEGORY_IDS["frozen"]
    assert broad_category("Milk") == CATEGORY_IDS["dairy"]
    assert broad_category("Canned Vegetables") == CATEGORY_IDS["produce"]
    assert broad_category("Vegetable & Cooking Oils") == CATEGORY_IDS["pantry"]
    assert broad_category("Nut & Seed Butters") == CATEGORY_IDS["protein"]
    assert product_display_name("POTATO CHIPS, SEA SALT") == "Potato Chips, Sea Salt"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_zip", nargs="?", type=Path)
    parser.add_argument("output", nargs="?", type=Path)
    parser.add_argument("--release", default="2026-04-30")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    self_test()
    if args.self_test:
        print("USDA UPC builder self-test passed")
        return 0
    if args.source_zip is None or args.output is None:
        print("source_zip and output are required", file=sys.stderr)
        return 2
    result = build_database(args.source_zip, args.output, args.release)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
