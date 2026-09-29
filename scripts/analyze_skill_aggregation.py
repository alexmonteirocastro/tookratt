"""ALE-190: read-only probe for corpus-level skill aggregation.

Scrolls the live Qdrant collection and calls The Hub with no auth. Does not
upsert, delete, or create a payload index. Listing text is written only under
tmp/ale190/ (gitignored).

Usage:

    uv run python scripts/analyze_skill_aggregation.py dates
    uv run python scripts/analyze_skill_aggregation.py facet
    uv run python scripts/analyze_skill_aggregation.py corpus
    uv run python scripts/analyze_skill_aggregation.py dictionary
    uv run python scripts/analyze_skill_aggregation.py llm-curate
    uv run python scripts/analyze_skill_aggregation.py llm-extract
    uv run python scripts/analyze_skill_aggregation.py score
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from qdrant_client import QdrantClient  # noqa: E402
from qdrant_client.http.exceptions import UnexpectedResponse  # noqa: E402

from db import get_settings  # noqa: E402
from the_hub_client.http import hub_get  # noqa: E402
from the_hub_client.models import CountryCode  # noqa: E402
from the_hub_client.utils import (  # noqa: E402
    HUB_BASE_URL,
    JOB_LISTINGS_ENDPOINT_ROUTE,
    SINGLE_JOB_ENDPOINT_ROUTE,
)

OUT_DIR = _REPO_ROOT / "tmp" / "ale190"
CORPUS_PATH = OUT_DIR / "corpus.jsonl"
GOLD_CANDIDATES_PATH = OUT_DIR / "gold_candidates.json"
GOLD_LABELS_PATH = OUT_DIR / "gold_labels.json"
DATES_PATH = OUT_DIR / "dates-2026-09-29.json"
FACET_PATH = OUT_DIR / "facet.json"
DICTIONARY_PATH = OUT_DIR / "dictionary.json"
LLM_CURATOR_PATH = OUT_DIR / "llm_curator.json"
LLM_EXTRACT_PATH = OUT_DIR / "llm_extract.json"
SCORE_PATH = OUT_DIR / "score.json"

# Same stack list as scripts/analyze_e5_truncation_signal_positions.py.
# Role words in that file are not skills and are not part of this seed.
SEED_SKILLS: tuple[str, ...] = (
    "Python",
    "React",
    "Kubernetes",
    "Terraform",
    "Django",
    "FastAPI",
    "Golang",
    "Go",
)

ROLE_GROUPS: dict[str, tuple[str, ...]] = {
    "frontend": ("frontenddeveloper",),
    "design": ("design", "uxuidesigner"),
    "marketing": ("marketing",),
    "sales": ("sales",),
}

GOLD_PER_GROUP = 6
SAMPLE_SIZE = 100
RNG_SEED = 190
SCROLL_BATCH = 100
FACET_LIMITS = (10, 50)
AMBIGUOUS_TOKENS = ("Go", "R", "Spark", "Swift")
DATE_KEY_RE = re.compile(
    r"(date|time|stamp|publish|expir|creat|updat|renew|posted)",
    re.IGNORECASE,
)
_ISO_DATE = r"\d{4}-\d{2}-\d{2}"
_ISO_TIME = r"(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?"
ISO_VALUE_RE = re.compile(rf"^{_ISO_DATE}{_ISO_TIME}$")
STOPWORDS = frozenset(
    """
    a an the and or of to for in on with at from by as is are was were be been
    being this that these those it its we you our your they their not no yes
    will can may about into over per via if then than so such other more most
    also have has had do does did but who what when where how which while
    job title company description role team work working experience looking
    join us our thehub
    """.split()
)
REQUIREMENT_RE = re.compile(
    r"\b(required|requirement|must|experience with|hands-on|proficien)\b",
    re.IGNORECASE,
)
LLM_MODEL_DEFAULT = "gemini-2.5-flash"
# The project default returned 404 on 2026-09-29 ("no longer available to new
# users"). This probe pins the model the API named as the replacement.
PROBE_MODEL = "gemini-3.8-flash"
LLM_PAUSE_SECONDS = 7.0
EXTRACT_BATCH = 8


@dataclass(frozen=True)
class Posting:
    job_id: str
    job_title: str
    company: str
    job_role: str
    country: str
    document_text: str

    def role_group(self) -> str | None:
        """Stratum for sampling. Payload job_role is usually N/A, so titles count."""
        title = self.job_title.casefold()
        role = self.job_role.casefold()
        if role == "frontenddeveloper" or any(
            needle in title for needle in ("frontend", "front-end", "front end")
        ):
            return "frontend"
        if role in {"design", "uxuidesigner"} or any(
            needle in title
            for needle in ("designer", "ux/ui", "ui/ux", "product design")
        ):
            return "design"
        if role == "marketing" or "marketing" in title:
            return "marketing"
        if role == "sales" or any(
            needle in title for needle in ("sales", "account executive")
        ):
            return "sales"
        return None


@dataclass(frozen=True)
class SkillHit:
    name: str
    count: int
    prominence: str


def _client() -> QdrantClient:
    settings = get_settings()
    kwargs: dict[str, Any] = {
        "url": settings.qdrant_url,
        "timeout": settings.qdrant_timeout,
    }
    if settings.qdrant_api_key:
        kwargs["api_key"] = settings.qdrant_api_key
    return QdrantClient(**kwargs)


def _collection() -> str:
    return get_settings().qdrant_collection_name


def is_date_like_key(key: str) -> bool:
    return DATE_KEY_RE.search(key) is not None


def is_iso_datetime(value: object) -> bool:
    return isinstance(value, str) and ISO_VALUE_RE.match(value.strip()) is not None


def walk_fields(node: object, path: str = "") -> list[dict[str, str]]:
    """Flatten JSON into path, type, and a short value preview."""
    rows: list[dict[str, str]] = []
    if isinstance(node, dict):
        for key, value in node.items():
            child = f"{path}.{key}" if path else str(key)
            rows.extend(walk_fields(value, child))
        return rows
    if isinstance(node, list):
        preview = f"list[{len(node)}]"
        rows.append({"path": path or "$", "type": "list", "preview": preview})
        if node and not isinstance(node[0], (dict, list)):
            rows.append(
                {
                    "path": f"{path}[]",
                    "type": type(node[0]).__name__,
                    "preview": _preview(node[0]),
                }
            )
        return rows
    rows.append(
        {
            "path": path or "$",
            "type": type(node).__name__,
            "preview": _preview(node),
        }
    )
    return rows


def date_like_fields(node: object) -> list[dict[str, str]]:
    kept: list[dict[str, str]] = []
    for row in walk_fields(node):
        path = row["path"]
        key = path.rsplit(".", 1)[-1]
        if is_date_like_key(key) or is_iso_datetime(row["preview"]):
            kept.append(row)
    return kept


def _preview(value: object, limit: int = 80) -> str:
    text = str(value).replace("\n", " ")
    if len(text) > limit:
        return text[:limit] + "…"
    return text


def _word_pattern(skill: str) -> re.Pattern[str]:
    if skill.casefold() in {"go", "r"}:
        return re.compile(rf"(?<![A-Za-z]){re.escape(skill)}(?![A-Za-z])")
    if skill.casefold() == "spark":
        return re.compile(r"(?<![A-Za-z])Spark(?![A-Za-z])")
    if skill.casefold() == "swift":
        return re.compile(r"(?<![A-Za-z])Swift(?![A-Za-z])")
    return re.compile(rf"(?<![A-Za-z0-9]){re.escape(skill)}(?![A-Za-z0-9])", re.I)


def match_skill(text: str, skill: str) -> list[re.Match[str]]:
    """Dictionary hit. Ambiguity rules come from non-gold postings, not the gold set."""
    matches = list(_word_pattern(skill).finditer(text))
    if skill.casefold() == "go":
        return [match for match in matches if _go_is_skill(text, match)]
    if skill.casefold() == "r":
        return [match for match in matches if _r_is_skill(text, match)]
    if skill.casefold() == "spark":
        return [match for match in matches if _spark_is_skill(text, match)]
    if skill.casefold() == "swift":
        return [match for match in matches if _swift_is_skill(text, match)]
    return matches


_GO_NEXT = re.compile(
    r"\s+(deep|to|through|beyond|live|ahead|back|out|on|for|into|home)\b",
    re.IGNORECASE,
)


def _go_is_skill(text: str, match: re.Match[str]) -> bool:
    before = text[max(0, match.start() - 16) : match.start()]
    after = text[match.end() : match.end() + 16]
    if "good to" in before.casefold():
        return False
    return _GO_NEXT.match(after) is None


def _r_is_skill(text: str, match: re.Match[str]) -> bool:
    before = text[match.start() - 1 : match.start()]
    after = text[match.end() : match.end() + 1]
    if before == "." or after == ".":
        return False
    if after.isdigit():
        return False
    window = text[max(0, match.start() - 24) : match.end() + 24].casefold()
    return any(
        hint in window for hint in ("r language", "r studio", "rstudio", "tidyverse")
    )


def _spark_is_skill(text: str, match: re.Match[str]) -> bool:
    window = text[max(0, match.start() - 32) : match.end() + 32].casefold()
    if "ads" in window or "tiktok" in window:
        return False
    return any(hint in window for hint in ("apache", "databricks", "flink", "pyspark"))


def _swift_is_skill(text: str, match: re.Match[str]) -> bool:
    window = text[max(0, match.start() - 32) : match.end() + 40].casefold()
    if "sepa" in window or "payment" in window or "treasury" in window:
        return False
    return any(
        hint in window for hint in ("swiftui", "ios", "kotlin", "uikit", "xcode")
    )


def skill_hits(text: str, skills: tuple[str, ...] | list[str]) -> list[SkillHit]:
    hits: list[SkillHit] = []
    for skill in skills:
        found = match_skill(text, skill)
        if not found:
            continue
        windows = [text[max(0, m.start() - 40) : m.end() + 40] for m in found]
        core = (
            any(REQUIREMENT_RE.search(window) for window in windows) or len(found) >= 2
        )
        hits.append(
            SkillHit(
                name=skill,
                count=len(found),
                prominence="core" if core else "mention",
            )
        )
    return hits


def context_windows(text: str, token: str, radius: int = 48) -> list[str]:
    return [
        text[max(0, match.start() - radius) : match.end() + radius].replace("\n", " ")
        for match in match_skill(text, token)
    ]


CAP_TOKEN_RE = re.compile(r"\b[A-Z][A-Za-z0-9+#.]{1,}\b")
TECH_TOKEN_RE = re.compile(
    r"\b(?:[A-Z]{2,6}|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)\b"
)
HEADING_WORDS = frozenset(
    """
    about the our your you we they what who how why join our team role this
    that these who are looking for skills offer location apply now company
    description job title senior junior lead staff head
    """.split()
)


def tech_terms(text: str) -> set[str]:
    """Acronyms, camelCase, and dotted names. Sentence-case English is excluded."""
    return {
        tok.casefold()
        for tok in TECH_TOKEN_RE.findall(text)
        if tok.casefold() not in STOPWORDS and tok.casefold() not in HEADING_WORDS
    }


def capitalized_terms(text: str) -> set[str]:
    """Capitalized tokens in one posting. Tool names usually look like this."""
    tokens = [
        tok
        for tok in CAP_TOKEN_RE.findall(text)
        if tok.casefold() not in STOPWORDS and tok.casefold() not in HEADING_WORDS
    ]
    terms = {tok.casefold() for tok in tokens}
    terms.update(
        f"{left.casefold()} {right.casefold()}"
        for left, right in zip(tokens, tokens[1:], strict=False)
    )
    return terms


def precision_recall(gold: set[str], predicted: set[str]) -> dict[str, float | int]:
    tp = len(gold & predicted)
    fp = len(predicted - gold)
    fn = len(gold - predicted)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
    }


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _load_corpus() -> list[Posting]:
    postings: list[Posting] = []
    for line in CORPUS_PATH.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        postings.append(
            Posting(
                job_id=str(row["job_id"]),
                job_title=str(row["job_title"]),
                company=str(row["company"]),
                job_role=str(row["job_role"]),
                country=str(row["country"]),
                document_text=str(row["document_text"]),
            )
        )
    return postings


def _gold_ids() -> set[str]:
    if not GOLD_LABELS_PATH.exists():
        return set()
    labels = _read_json(GOLD_LABELS_PATH)
    return {str(row["job_id"]) for row in labels}


def cmd_dates() -> None:
    """Save date-like fields for a second fetch on or after 2026-09-30."""
    captured: list[dict[str, Any]] = []
    listing_keys: list[dict[str, Any]] = []
    for country in CountryCode:
        url = (
            f"{HUB_BASE_URL}{JOB_LISTINGS_ENDPOINT_ROUTE}"
            f"?page=1&countryCode={country.value}"
        )
        payload = hub_get(url).json()
        docs = payload.get("docs") or []
        if not docs:
            listing_keys.append({"country": country.value, "docs": 0})
            continue
        first = docs[0]
        listing_keys.append(
            {
                "country": country.value,
                "top_level_types": [
                    {"key": key, "type": type(value).__name__}
                    for key, value in first.items()
                ],
                "date_like": date_like_fields(first),
            }
        )
        ids = [str(doc.get("id", "")) for doc in docs if doc.get("id")]
        take = 4 if country.value in {"DK", "SE", "NO", "FI"} else 2
        for job_id in ids[:take]:
            single = hub_get(
                f"{HUB_BASE_URL}{SINGLE_JOB_ENDPOINT_ROUTE}/{job_id}"
            ).json()
            captured.append(
                {
                    "country_query": country.value,
                    "job_id": job_id,
                    "listing_date_like": date_like_fields(
                        next(doc for doc in docs if str(doc.get("id")) == job_id)
                    ),
                    "single_top_level_types": [
                        {"key": key, "type": type(value).__name__}
                        for key, value in single.items()
                    ],
                    "single_date_like": date_like_fields(single),
                }
            )
            if len(captured) >= 20:
                break
        if len(captured) >= 20:
            break
    _write_json(
        DATES_PATH,
        {
            "captured_on": datetime.now(UTC).date().isoformat(),
            "earliest_second_fetch": "2026-09-30",
            "note": (
                "Day-1 capture only. A stability compare needs a second fetch "
                "at least one calendar day later. Do not treat these values "
                "as stable."
            ),
            "listing_docs0": listing_keys,
            "jobs": captured,
        },
    )
    print(f"Wrote {len(captured)} jobs to {DATES_PATH}")


def _facet_once(
    client: QdrantClient,
    collection: str,
    *,
    key: str,
    exact: bool,
    limit: int,
) -> dict[str, Any]:
    try:
        response = client.facet(
            collection_name=collection,
            key=key,
            exact=exact,
            limit=limit,
        )
    except UnexpectedResponse as exc:
        return {
            "key": key,
            "exact": exact,
            "limit": limit,
            "error": str(exc)[:500],
        }
    hits = [{"value": str(hit.value), "count": hit.count} for hit in response.hits]
    return {"key": key, "exact": exact, "limit": limit, "hits": hits}


def cmd_facet() -> None:
    client = _client()
    collection = _collection()
    info = client.get_collection(collection)
    payload_schema = info.payload_schema or {}
    runs: list[dict[str, Any]] = []
    for exact in (False, True):
        for limit in FACET_LIMITS:
            runs.append(
                _facet_once(
                    client,
                    collection,
                    key="Country",
                    exact=exact,
                    limit=limit,
                )
            )
    runs.append(_facet_once(client, collection, key="job_role", exact=True, limit=50))
    _write_json(
        FACET_PATH,
        {
            "collection": collection,
            "points_count": info.points_count,
            "indexed_fields": {
                name: str(schema) for name, schema in payload_schema.items()
            },
            "runs": runs,
        },
    )
    print(f"Wrote facet probe to {FACET_PATH}")


def _scroll_postings(client: QdrantClient, collection: str) -> list[Posting]:
    postings: list[Posting] = []
    offset = None
    while True:
        points, next_offset = client.scroll(
            collection_name=collection,
            limit=SCROLL_BATCH,
            offset=offset,
            with_payload=[
                "job_url_identifier",
                "job_title",
                "company",
                "job_role",
                "Country",
                "document_text",
            ],
            with_vectors=False,
        )
        for point in points:
            payload = point.payload or {}
            job_id = payload.get("job_url_identifier")
            text = payload.get("document_text")
            if not job_id or not text:
                continue
            postings.append(
                Posting(
                    job_id=str(job_id),
                    job_title=str(payload.get("job_title") or ""),
                    company=str(payload.get("company") or ""),
                    job_role=str(payload.get("job_role") or ""),
                    country=str(payload.get("Country") or ""),
                    document_text=str(text),
                )
            )
        if next_offset is None:
            break
        offset = next_offset
    return postings


def _choose_gold(postings: list[Posting]) -> list[Posting]:
    """Six postings per role group. Skip a second country copy of the same text."""
    rng = random.Random(RNG_SEED)
    chosen: list[Posting] = []
    seen_text: set[str] = set()
    for group in ROLE_GROUPS:
        pool = [post for post in postings if post.role_group() == group]
        rng.shuffle(pool)
        taken = 0
        for post in pool:
            if post.document_text in seen_text:
                continue
            chosen.append(post)
            seen_text.add(post.document_text)
            taken += 1
            if taken == GOLD_PER_GROUP:
                break
    return chosen


def _choose_sample(postings: list[Posting], gold: list[Posting]) -> list[Posting]:
    rng = random.Random(RNG_SEED)
    selected = {post.job_id: post for post in gold}
    grouped: dict[str, list[Posting]] = {group: [] for group in ROLE_GROUPS}
    other: list[Posting] = []
    for post in postings:
        group = post.role_group()
        if group is None:
            other.append(post)
        else:
            grouped[group].append(post)
    for pool in (*grouped.values(), other):
        rng.shuffle(pool)
    order = [post for group in ROLE_GROUPS for post in grouped[group]]
    order.extend(other)
    for post in order:
        if len(selected) >= SAMPLE_SIZE:
            break
        selected.setdefault(post.job_id, post)
    return list(selected.values())


def cmd_corpus() -> None:
    postings = _scroll_postings(_client(), _collection())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with CORPUS_PATH.open("w", encoding="utf-8") as handle:
        for post in postings:
            handle.write(
                json.dumps(
                    {
                        "job_id": post.job_id,
                        "job_title": post.job_title,
                        "company": post.company,
                        "job_role": post.job_role,
                        "country": post.country,
                        "document_text": post.document_text,
                    },
                    ensure_ascii=True,
                )
                + "\n"
            )
    gold = _choose_gold(postings)
    sample = _choose_sample(postings, gold)
    _write_json(
        GOLD_CANDIDATES_PATH,
        [
            {
                "job_id": post.job_id,
                "job_title": post.job_title,
                "company": post.company,
                "job_role": post.job_role,
                "role_group": post.role_group(),
                "country": post.country,
                "document_text": post.document_text,
            }
            for post in gold
        ],
    )
    _write_json(
        OUT_DIR / "sample_ids.json",
        [
            {
                "job_id": post.job_id,
                "role_group": post.role_group(),
                "job_role": post.job_role,
            }
            for post in sample
        ],
    )
    roles = Counter(post.job_role for post in postings)
    print(f"Scrolled {len(postings)} postings")
    print(f"Gold candidates: {len(gold)} -> {GOLD_CANDIDATES_PATH}")
    for role, count in roles.most_common(30):
        print(f"  {count:4d}  {role}")


def cmd_dictionary() -> None:
    postings = _load_corpus()
    held_out = _gold_ids()
    if not held_out:
        raise SystemExit(f"Missing gold labels at {GOLD_LABELS_PATH}")
    trainable = [post for post in postings if post.job_id not in held_out]
    seed_names = {skill.casefold() for skill in SEED_SKILLS}
    unmatched: Counter[str] = Counter()
    tech: Counter[str] = Counter()
    ambiguous: dict[str, list[dict[str, str]]] = {
        token: [] for token in AMBIGUOUS_TOKENS
    }
    seed_docs: Counter[str] = Counter()
    for post in trainable:
        for hit in skill_hits(post.document_text, SEED_SKILLS):
            seed_docs[hit.name] += 1
        counts = capitalized_terms(post.document_text)
        for term in counts:
            if term in seed_names:
                continue
            unmatched[term] += 1
        for term in tech_terms(post.document_text):
            if term in seed_names:
                continue
            tech[term] += 1
        for token in AMBIGUOUS_TOKENS:
            windows = context_windows(post.document_text, token)
            for window in windows[:2]:
                if len(ambiguous[token]) >= 12:
                    break
                ambiguous[token].append(
                    {
                        "job_id": post.job_id,
                        "job_role": post.job_role,
                        "window": window,
                    }
                )
    top_unmatched = [
        {"term": term, "postings": count}
        for term, count in unmatched.most_common(80)
        if count >= 5
    ]
    _write_json(
        DICTIONARY_PATH,
        {
            "trainable_postings": len(trainable),
            "held_out": len(held_out),
            "seed_document_frequency": dict(seed_docs),
            "denominator": len(trainable),
            "ambiguous_windows_non_gold": ambiguous,
            "unmatched_ngrams": top_unmatched,
            "tech_tokens": [
                {"term": term, "postings": count}
                for term, count in tech.most_common(60)
                if count >= 5
            ],
        },
    )
    print(f"Wrote dictionary probe to {DICTIONARY_PATH}")


def _llm_model() -> str:
    return PROBE_MODEL


def _generate_json(prompt: str, cache_key: str) -> Any:
    cache_path = OUT_DIR / "llm_cache" / f"{cache_key}.json"
    if cache_path.exists():
        return _read_json(cache_path)
    from google import genai
    from google.genai import types

    from llm_client.settings import LLMSettings

    settings = LLMSettings()
    if not settings.gemini_api_key:
        raise SystemExit("GEMINI_API_KEY is unset")
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=PROBE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0,
            response_mime_type="application/json",
        ),
    )
    text = response.text or ""
    parsed = json.loads(text)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    _write_json(
        cache_path,
        {"model": PROBE_MODEL, "raw": text, "parsed": parsed},
    )
    time.sleep(LLM_PAUSE_SECONDS)
    return _read_json(cache_path)


def cmd_llm_curate() -> None:
    report = _read_json(DICTIONARY_PATH)
    tokens = report.get("tech_tokens") or report["unmatched_ngrams"]
    terms = [row["term"] for row in tokens[:60]]
    prompt = (
        "You classify job-posting n-grams. Return JSON "
        '{"items":[{"term":"","is_skill":false,"canonical":"","category":"",'
        '"aliases":[],"ambiguous":false}]}. '
        "A skill is a tool, technology, method, or durable competence a role "
        "asks for. Not a skill: seniority, city, benefit, generic verb, or "
        "the role title itself. aliases may include Danish, Swedish, or Dutch "
        "variants when you know them. ambiguous is true for tokens like Go, "
        "R, Spark, or Swift when the string is not enough.\n\n"
        f"Terms:\n{json.dumps(terms)}"
    )
    cached = _generate_json(prompt, "curator-v1")
    _write_json(
        LLM_CURATOR_PATH,
        {"model": cached["model"], "items": cached["parsed"]},
    )
    print(f"Wrote curator output to {LLM_CURATOR_PATH}")


def cmd_llm_extract() -> None:
    postings = {post.job_id: post for post in _load_corpus()}
    sample = _read_json(OUT_DIR / "sample_ids.json")
    batches: list[list[dict[str, str]]] = []
    current: list[dict[str, str]] = []
    for row in sample:
        post = postings[row["job_id"]]
        current.append(
            {
                "job_id": post.job_id,
                "job_title": post.job_title,
                "job_role": post.job_role,
                "text": post.document_text[:6000],
            }
        )
        if len(current) == EXTRACT_BATCH:
            batches.append(current)
            current = []
    if current:
        batches.append(current)
    extracted: list[dict[str, Any]] = []
    model = _llm_model()
    for index, batch in enumerate(batches):
        prompt = (
            "Extract skills from each job posting. Return JSON "
            '{"jobs":[{"job_id":"","skills":[{"name":"","prominence":"core"}]}]}. '
            "prominence is core when the skill is a stated requirement, "
            "mention when it is a passing reference. Use a short canonical "
            "English name. Do not invent skills that are not in the text.\n\n"
            f"{json.dumps(batch, ensure_ascii=False)}"
        )
        cached = _generate_json(prompt, f"extract-v1-{index}")
        model = str(cached["model"])
        jobs = cached["parsed"].get("jobs", [])
        extracted.extend(jobs)
        print(f"Batch {index + 1}/{len(batches)}")
    _write_json(
        LLM_EXTRACT_PATH,
        {"model": model, "temperature": 0, "jobs": extracted},
    )
    print(f"Wrote {len(extracted)} extractions to {LLM_EXTRACT_PATH}")


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().casefold()


def cmd_score(dictionary: list[str]) -> None:
    labels = _read_json(GOLD_LABELS_PATH)
    postings = {post.job_id: post for post in _load_corpus()}
    extracted: dict[str, set[str]] = {}
    if LLM_EXTRACT_PATH.exists():
        for row in _read_json(LLM_EXTRACT_PATH)["jobs"]:
            extracted[str(row["job_id"])] = {
                _normalize_name(skill["name"])
                for skill in row.get("skills", [])
                if skill.get("name")
            }
    by_group: dict[str, dict[str, dict[str, dict[str, float | int]]]] = {}
    totals: dict[str, dict[str, int]] = {
        "dictionary": {"tp": 0, "fp": 0, "fn": 0},
        "llm": {"tp": 0, "fp": 0, "fn": 0},
    }
    disagreements: list[dict[str, Any]] = []
    for row in labels:
        job_id = str(row["job_id"])
        group = str(row["role_group"])
        gold = {_normalize_name(skill["name"]) for skill in row["skills"]}
        post = postings[job_id]
        predicted = {
            _normalize_name(hit.name)
            for hit in skill_hits(post.document_text, dictionary)
        }
        dict_score = precision_recall(gold, predicted)
        llm_predicted = extracted.get(job_id, set())
        llm_score = precision_recall(gold, llm_predicted)
        bucket = by_group.setdefault(group, {})
        bucket[job_id] = {"dictionary": dict_score, "llm": llm_score}
        for method, score in ("dictionary", dict_score), ("llm", llm_score):
            for key in ("tp", "fp", "fn"):
                totals[method][key] += int(score[key])
        if predicted != llm_predicted:
            disagreements.append(
                {
                    "job_id": job_id,
                    "role_group": group,
                    "job_title": post.job_title,
                    "only_dictionary": sorted(predicted - llm_predicted),
                    "only_llm": sorted(llm_predicted - predicted),
                    "gold": sorted(gold),
                }
            )
    summary: dict[str, dict[str, float | int]] = {}
    for method, counts in totals.items():
        tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
        summary[method] = {
            **counts,
            "precision": round(tp / (tp + fp), 3) if tp + fp else 0.0,
            "recall": round(tp / (tp + fn), 3) if tp + fn else 0.0,
        }
    _write_json(
        SCORE_PATH,
        {
            "dictionary": dictionary,
            "pooled": summary,
            "per_job": by_group,
            "disagreements_on_gold": disagreements,
        },
    )
    print(json.dumps(summary, indent=2))
    print(f"Gold disagreements: {len(disagreements)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=(
            "dates",
            "facet",
            "corpus",
            "dictionary",
            "llm-curate",
            "llm-extract",
            "score",
        ),
    )
    parser.add_argument(
        "--dictionary",
        default=",".join(SEED_SKILLS),
        help="Comma-separated skills for the score command.",
    )
    args = parser.parse_args()
    if args.command == "dates":
        cmd_dates()
    elif args.command == "facet":
        cmd_facet()
    elif args.command == "corpus":
        cmd_corpus()
    elif args.command == "dictionary":
        cmd_dictionary()
    elif args.command == "llm-curate":
        cmd_llm_curate()
    elif args.command == "llm-extract":
        cmd_llm_extract()
    else:
        skills = [part.strip() for part in args.dictionary.split(",") if part.strip()]
        cmd_score(skills)


if __name__ == "__main__":
    main()
