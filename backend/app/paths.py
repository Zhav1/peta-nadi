"""
Layout-agnostic asset path resolution.

The backend runs in two different directory layouts and the same module must
resolve its data files correctly in both:

  * Repo checkout:  D:\\College\\Pidi.id\\backend\\app\\<sub>\\<mod>.py
        _APP_DIR     = <repo>/backend/app
        _PROJECT_DIR = <repo>/backend
        _REPO_ROOT   = <repo>
        data candidates: <repo>/backend/data, <repo>/data

  * Docker image:   /app/app/<sub>/<mod>.py   (Dockerfile does `COPY backend/ .`)
        _APP_DIR     = /app/app
        _PROJECT_DIR = /app
        _REPO_ROOT   = /
        data candidates: /app/data, /data

Anchoring on this module's own location (instead of `parents[N]` from a module
buried three levels deep) keeps both layouts correct without branching.

Optional env overrides are checked first:
  * PREHUB_DATA_DIR  — absolute path to a data directory
  * PREHUB_REPO_ROOT — absolute path to a repository root (its `data/` is used)
"""
import os
from pathlib import Path
from typing import Optional, Tuple

_APP_DIR = Path(__file__).resolve().parent        # backend/app   or /app/app
_PROJECT_DIR = _APP_DIR.parent                    # backend       or /app
_REPO_ROOT = _PROJECT_DIR.parent                  # repo root     or /

DATA_DIR_ENV = "PREHUB_DATA_DIR"
REPO_ROOT_ENV = "PREHUB_REPO_ROOT"


def _data_candidates() -> Tuple[Path, ...]:
    """Ordered data-directory candidates for the current layout (env overrides first)."""
    candidates = []
    override = os.environ.get(DATA_DIR_ENV)
    if override:
        candidates.append(Path(override))
    candidates.append(_PROJECT_DIR / "data")
    candidates.append(_REPO_ROOT / "data")
    return tuple(candidates)


def _repo_candidates() -> Tuple[Path, ...]:
    """Ordered repository-root candidates for the current layout (env overrides first)."""
    candidates = []
    override = os.environ.get(REPO_ROOT_ENV)
    if override:
        candidates.append(Path(override))
    candidates.append(_REPO_ROOT)
    candidates.append(_PROJECT_DIR)
    return tuple(candidates)


def data_dirs() -> Tuple[Path, ...]:
    """All candidate data directories, in resolution order."""
    return _data_candidates()


def find_data_path(*parts: str) -> Optional[Path]:
    """First existing data path matching `parts`, or None."""
    for base in _data_candidates():
        candidate = base.joinpath(*parts)
        if candidate.exists():
            return candidate
    return None


def data_path(*parts: str) -> Path:
    """First existing data path matching `parts`; else the primary candidate (never raises)."""
    found = find_data_path(*parts)
    if found is not None:
        return found
    return _data_candidates()[0].joinpath(*parts)


def find_repo_path(*parts: str) -> Optional[Path]:
    """First existing repo-root-relative path matching `parts`, or None."""
    for base in _repo_candidates():
        candidate = base.joinpath(*parts)
        if candidate.exists():
            return candidate
    return None


def repo_path(*parts: str) -> Path:
    """First existing repo-root-relative path matching `parts`; else the primary candidate."""
    found = find_repo_path(*parts)
    if found is not None:
        return found
    return _repo_candidates()[0].joinpath(*parts)
