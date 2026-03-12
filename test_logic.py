"""Tests for the Bloei Rekenmodule calculation engine."""

import sys
import os
sys.path.insert(0, os.path.abspath('backend'))

import pytest
from datetime import date
from bloei_rekenmodel.domain import RekenInput, EenmaligeCashflow
from bloei_rekenmodel.logic import bereken_kosten


def _base_input(**overrides) -> RekenInput:
    defaults = dict(
        startvermogen=100_000,
        profiel="Neutraal",
        startdatum=date(2026, 1, 1),
        horizon_jaren=15,
        n_scenarios=100,
    )
    defaults.update(overrides)
    return RekenInput(**defaults)


class TestBasicSmoke:
    def test_basic_run_returns_output(self):
        out = bereken_kosten(_base_input())
        assert out.verwacht_eindvermogen_netto > 0
        assert out.kosten_eur_jaar1 > 0
        assert len(out.tijdlijn_datums) == 15 * 12 + 1

    def test_output_percentiles_ordered(self):
        out = bereken_kosten(_base_input())
        assert out.verwacht_eindvermogen_p10_netto <= out.verwacht_eindvermogen_p50_netto
        assert out.verwacht_eindvermogen_p50_netto <= out.verwacht_eindvermogen_p90_netto


class TestEdgeCases:
    def test_startvermogen_zero(self):
        out = bereken_kosten(_base_input(startvermogen=0))
        assert out.verwacht_eindvermogen_netto == 0
        assert out.kosten_eur_jaar1 == 0
        assert out.kosten_pct_jaar1 == 0

    def test_horizon_one_year(self):
        out = bereken_kosten(_base_input(horizon_jaren=1))
        assert len(out.tijdlijn_datums) == 13  # 12 months + start
        assert out.verwacht_eindvermogen_netto > 0

    def test_niet_beleggen_full_horizon(self):
        out = bereken_kosten(_base_input(profiel="Niet beleggen"))
        assert out.verwacht_eindvermogen_netto == 100_000
        assert out.verwacht_rendement_pct == 0.0
        assert out.kosten_eur_jaar1 == 0.0


class TestCashflows:
    def test_simultaneous_storting_and_onttrekking(self):
        cfs = [
            EenmaligeCashflow(bedrag=10_000, datum=date(2026, 6, 1), type="storting"),
            EenmaligeCashflow(bedrag=10_000, datum=date(2026, 6, 1), type="onttrekking"),
        ]
        out = bereken_kosten(_base_input(eenmalige_cashflows=cfs))
        assert out.verwacht_eindvermogen_netto > 0

    def test_cashflow_on_end_date(self):
        end_date = date(2041, 1, 1)  # 15 years from 2026-01-01
        cfs = [
            EenmaligeCashflow(bedrag=50_000, datum=end_date, type="storting"),
        ]
        out = bereken_kosten(_base_input(eenmalige_cashflows=cfs))
        assert out.verwacht_eindvermogen_netto > 150_000

    def test_periodic_storting_increases_vermogen(self):
        out_without = bereken_kosten(_base_input())
        out_with = bereken_kosten(_base_input(periodieke_storting_maandelijks=500))
        assert out_with.verwacht_eindvermogen_netto > out_without.verwacht_eindvermogen_netto

    def test_periodic_onttrekking_decreases_vermogen(self):
        out_without = bereken_kosten(_base_input())
        out_with = bereken_kosten(_base_input(periodieke_onttrekking_maandelijks=200))
        assert out_with.verwacht_eindvermogen_netto < out_without.verwacht_eindvermogen_netto


class TestAfbouwProfiel:
    def test_afbouw_crosses_all_thresholds(self):
        out = bereken_kosten(_base_input(
            profiel="Zeer offensief",
            horizon_jaren=20,
            afbouw_profiel=True,
        ))
        profiles = set(out.tijdlijn_profiel)
        assert "Zeer offensief" in profiles
        assert "Niet beleggen" in profiles
        assert len(profiles) > 2

    def test_afbouw_ends_defensively(self):
        out = bereken_kosten(_base_input(
            profiel="Zeer offensief",
            horizon_jaren=20,
            afbouw_profiel=True,
        ))
        assert out.tijdlijn_profiel[-1] == "Niet beleggen"


class TestKostenJaar1:
    def test_kosten_reflect_periodic_stortingen(self):
        out_base = bereken_kosten(_base_input())
        out_storting = bereken_kosten(_base_input(periodieke_storting_maandelijks=1000))
        assert out_storting.kosten_eur_jaar1 > out_base.kosten_eur_jaar1

    def test_kosten_pct_consistent(self):
        out = bereken_kosten(_base_input())
        assert out.kosten_pct_jaar1 == pytest.approx(
            (out.kosten_eur_jaar1 / 100_000) * 100, abs=0.01
        )


class TestBloeiPlus:
    def test_bloei_plus_higher_costs(self):
        out_standard = bereken_kosten(_base_input())
        out_plus = bereken_kosten(_base_input(is_bloei_plus=True))
        assert out_plus.kosten_eur_jaar1 > out_standard.kosten_eur_jaar1
