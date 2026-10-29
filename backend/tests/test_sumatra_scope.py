"""Unit A — Sumatra scope mask contract.

Pins the geographic truth: live aircraft + fire hotspots outside the Sumatra
operational scope must be dropped at the data source.
"""
import math

from app.services.sumatra_scope import is_in_sumatra_scope, scope_asset_status


def test_scope_asset_loads():
    status = scope_asset_status()
    assert status["ok"] is True, f"scope asset must load: {status}"
    assert status["bbox"] == [94.0, -7.0, 109.0, 7.0]
    assert status["resolution"] == 0.01


def test_kuala_lumpur_false_for_air():
    assert is_in_sumatra_scope(101.6869, 3.1390, "air") is False
    assert is_in_sumatra_scope(101.6869, 3.1390, "aircraft") is False


def test_singapore_false_for_air():
    assert is_in_sumatra_scope(103.8198, 1.3521, "air") is False


def test_south_china_sea_false_for_fire():
    assert is_in_sumatra_scope(105.0, 5.0, "fire") is False
    assert is_in_sumatra_scope(105.0, 5.0, "fire_land") is False


def test_belawan_true():
    assert is_in_sumatra_scope(98.6776, 3.7922, "air") is True
    assert is_in_sumatra_scope(98.6776, 3.7922, "fire") is True


def test_nias_true():
    assert is_in_sumatra_scope(97.6, 1.1, "air") is True


def test_batam_true():
    assert is_in_sumatra_scope(104.03, 1.13, "air") is True


def test_natuna_land_true_water_false_for_fire():
    assert is_in_sumatra_scope(108.2, 3.9, "fire") is True
    assert is_in_sumatra_scope(108.0, 4.5, "fire") is False


def test_jakarta_false_for_air():
    assert is_in_sumatra_scope(106.8456, -6.2088, "air") is False


def test_medan_true():
    assert is_in_sumatra_scope(98.6722, 3.5952, "air") is True


def test_profile_aliases():
    # fire aliases share bit 0
    assert is_in_sumatra_scope(98.6722, 3.5952, "fire") is True
    assert is_in_sumatra_scope(98.6722, 3.5952, "fire_land") is True
    # air aliases share bits 1|2
    assert is_in_sumatra_scope(98.6722, 3.5952, "aircraft") is True
    # island/mainland split: Medan is mainland, Nias is island
    assert is_in_sumatra_scope(98.6722, 3.5952, "air_mainland") is True
    assert is_in_sumatra_scope(97.6, 1.1, "air_island") is True


def test_outside_bbox_is_false():
    assert is_in_sumatra_scope(0.0, 0.0, "air") is False
    assert is_in_sumatra_scope(110.0, 0.0, "fire") is False
    assert is_in_sumatra_scope(100.0, 8.0, "air") is False
    assert is_in_sumatra_scope(float("nan"), 3.0, "air") is False
