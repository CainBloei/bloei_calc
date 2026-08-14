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

    def test_without_afbouw_matches_start_profile_return(self):
        out = bereken_kosten(_base_input(profiel="Neutraal", afbouw_profiel=False))
        assert out.verwacht_rendement_pct == pytest.approx(5.7422, abs=1e-6)

    def test_afbouw_lowers_expected_return_and_end_wealth(self):
        kwargs = dict(profiel="Zeer offensief", horizon_jaren=20, n_scenarios=200)
        out_off = bereken_kosten(_base_input(afbouw_profiel=False, **kwargs))
        out_on = bereken_kosten(_base_input(afbouw_profiel=True, **kwargs))
        assert out_off.verwacht_rendement_pct == pytest.approx(8.037, abs=1e-6)
        assert out_on.verwacht_rendement_pct < out_off.verwacht_rendement_pct
        assert out_on.verwacht_rendement_pct < 8.037
        assert out_on.tijdlijn_profiel[-1] == "Niet beleggen"
        assert out_on.verwacht_eindvermogen_netto < out_off.verwacht_eindvermogen_netto

    def test_afbouw_return_excludes_niet_beleggen_months(self):
        rendementen = {
            "Defensief": 3.4474,
            "Matig defensief": 4.5948,
            "Neutraal": 5.7422,
            "Offensief": 6.8896,
            "Zeer offensief": 8.037,
            "Niet beleggen": 0.0,
        }
        out = bereken_kosten(_base_input(
            profiel="Zeer offensief",
            horizon_jaren=20,
            afbouw_profiel=True,
            n_scenarios=50,
        ))
        invested = [p for p in out.tijdlijn_profiel[1:] if p != "Niet beleggen"]
        expected = sum(rendementen[p] for p in invested) / len(invested)
        assert out.verwacht_rendement_pct == pytest.approx(expected, abs=1e-6)
        assert "Niet beleggen" in out.tijdlijn_profiel
        assert out.verwacht_rendement_pct > 0.0


def _yearly_hit_months(cashflow: list[float], amount: float, tol: float = 1e-6) -> list[int]:
    return [i for i, v in enumerate(cashflow) if abs(v - amount) < tol]


class TestYearlyCashflows:
    def test_yearly_storting_increases_vermogen(self):
        out_without = bereken_kosten(_base_input())
        out_with = bereken_kosten(_base_input(periodieke_storting_jaarlijks=6_000))
        assert out_with.verwacht_eindvermogen_netto > out_without.verwacht_eindvermogen_netto

    def test_yearly_onttrekking_decreases_vermogen(self):
        out_without = bereken_kosten(_base_input())
        out_with = bereken_kosten(_base_input(periodieke_onttrekking_jaarlijks=2_000))
        assert out_with.verwacht_eindvermogen_netto < out_without.verwacht_eindvermogen_netto

    def test_yearly_storting_once_per_year(self):
        out = bereken_kosten(_base_input(
            periodieke_storting_jaarlijks=6_000,
            horizon_jaren=5,
            profiel="Niet beleggen",
        ))
        hits = _yearly_hit_months(out.tijdlijn_cashflow_netto, 6_000)
        assert hits == [1, 13, 25, 37, 49]
        assert len(hits) == 5

    def test_yearly_onttrekking_once_per_year(self):
        out = bereken_kosten(_base_input(
            periodieke_onttrekking_jaarlijks=3_000,
            horizon_jaren=4,
            profiel="Niet beleggen",
        ))
        hits = [i for i, v in enumerate(out.tijdlijn_cashflow_netto) if abs(v + 3_000) < 1e-6]
        assert hits == [1, 13, 25, 37]

    def test_yearly_combined_with_monthly(self):
        out = bereken_kosten(_base_input(
            periodieke_storting_maandelijks=100,
            periodieke_storting_jaarlijks=1_000,
            horizon_jaren=2,
            profiel="Niet beleggen",
        ))
        cf = out.tijdlijn_cashflow_netto
        anniversary = [i for i in range(1, len(cf)) if abs(cf[i] - 1_100) < 1e-6]
        monthly_only = [i for i in range(1, len(cf)) if abs(cf[i] - 100) < 1e-6]
        assert anniversary == [1, 13]
        assert len(monthly_only) == 22

    def test_yearly_respects_start_end_window(self):
        out = bereken_kosten(_base_input(
            startdatum=date(2026, 1, 1),
            horizon_jaren=15,
            periodieke_storting_jaarlijks=1_000,
            periodieke_storting_jaarlijks_startdatum=date(2028, 6, 1),
            periodieke_storting_jaarlijks_einddatum=date(2030, 6, 1),
            profiel="Niet beleggen",
        ))
        hits = _yearly_hit_months(out.tijdlijn_cashflow_netto, 1_000)
        assert hits == [30, 42, 54]

    def test_monthly_and_yearly_independent_windows(self):
        out = bereken_kosten(_base_input(
            startdatum=date(2026, 1, 1),
            horizon_jaren=5,
            periodieke_storting_maandelijks=100,
            periodieke_storting_startdatum=date(2026, 1, 1),
            periodieke_storting_einddatum=date(2026, 12, 1),
            periodieke_storting_jaarlijks=1_000,
            periodieke_storting_jaarlijks_startdatum=date(2028, 6, 1),
            periodieke_storting_jaarlijks_einddatum=date(2029, 6, 1),
            profiel="Niet beleggen",
        ))
        cf = out.tijdlijn_cashflow_netto
        monthly_hits = [i for i in range(1, len(cf)) if abs(cf[i] - 100) < 1e-6]
        yearly_hits = _yearly_hit_months(cf, 1_000)
        assert monthly_hits == list(range(1, 13))
        assert yearly_hits == [30, 42]


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

    def test_kosten_jaar1_components_sum_to_total(self):
        out = bereken_kosten(_base_input())
        assert out.beheerkosten_eur_jaar1 + out.fondskosten_eur_jaar1 + out.spreadkosten_eur_jaar1 == pytest.approx(
            out.kosten_eur_jaar1, abs=0.02
        )


class TestBloeiPlus:
    def test_bloei_plus_higher_costs(self):
        out_standard = bereken_kosten(_base_input())
        out_plus = bereken_kosten(_base_input(is_bloei_plus=True))
        assert out_plus.kosten_eur_jaar1 > out_standard.kosten_eur_jaar1
