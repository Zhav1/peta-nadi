"""
Layout-agnostic asset path resolution (app/paths.py).

The backend must resolve its data files in two layouts: the repo checkout
(<repo>/backend/app/...) and the Docker image (/app/app/..., where the
Dockerfile does `COPY backend/ .`). These tests pin both.
"""
from pathlib import Path

from app import paths


def test_benchmark_dataset_resolves_in_repo_checkout():
    resolved = paths.data_path("benchmark", "sumatra_disruptions_ground_truth.json")
    assert resolved.exists()
    assert resolved.is_file()
    assert resolved.name == "sumatra_disruptions_ground_truth.json"


def test_pihps_cache_dir_resolves_to_existing_directory():
    resolved = paths.data_path("raw", "pihps_bi", "api_cache")
    assert resolved.exists()
    assert resolved.is_dir()


def test_image_layout_prefers_project_data_dir_when_repo_root_absent(monkeypatch, tmp_path):
    """Image layout: _PROJECT_DIR == /app, _REPO_ROOT == /, so /data is absent.

    The candidate builder must then resolve to _PROJECT_DIR/"data" (/app/data).
    """
    project_dir = tmp_path / "app"
    (project_dir / "data" / "benchmark").mkdir(parents=True)
    target = project_dir / "data" / "benchmark" / "ground_truth.json"
    target.write_text("[]", encoding="utf-8")

    # Simulate the image: project dir is /app, repo root is / (no /data).
    monkeypatch.delenv(paths.DATA_DIR_ENV, raising=False)
    monkeypatch.setattr(paths, "_PROJECT_DIR", project_dir)
    monkeypatch.setattr(paths, "_REPO_ROOT", Path(tmp_path / "no-such-root"))

    candidates = paths._data_candidates()
    assert candidates[0] == project_dir / "data"
    assert all(not c.exists() for c in candidates[1:])

    resolved = paths.data_path("benchmark", "ground_truth.json")
    assert resolved == target
    assert resolved.exists()


def test_repo_path_returns_missing_path_without_raising(monkeypatch, tmp_path):
    monkeypatch.delenv(paths.REPO_ROOT_ENV, raising=False)
    monkeypatch.setattr(paths, "_REPO_ROOT", tmp_path)
    monkeypatch.setattr(paths, "_PROJECT_DIR", tmp_path / "backend")

    resolved = paths.repo_path("test-results", "benchmark_evaluation_report.json")
    # test-results/ is gitignored: absent from a clean checkout/image by design.
    assert resolved == tmp_path / "test-results" / "benchmark_evaluation_report.json"
    assert resolved.exists() is False
    assert paths.find_repo_path("test-results", "benchmark_evaluation_report.json") is None


def test_env_override_takes_precedence(monkeypatch, tmp_path):
    override = tmp_path / "override-data"
    (override / "benchmark").mkdir(parents=True)
    (override / "benchmark" / "x.json").write_text("{}", encoding="utf-8")

    monkeypatch.setenv(paths.DATA_DIR_ENV, str(override))
    assert paths.data_dirs()[0] == override
    assert paths.data_path("benchmark", "x.json") == override / "benchmark" / "x.json"
