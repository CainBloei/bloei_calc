"""Pure calculation logic for the Bloei Rekenmodule."""

from __future__ import annotations

from datetime import date
from math import sqrt
from typing import TypedDict
import calendar

import numpy as np

from bloei_rekenmodel.domain import EenmaligeCashflow, RekenInput, RekenOutput


def _add_years(d: date, years: int) -> date:
    """Add years to a date, clamping Feb 29 -> Feb 28 when needed."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(month=2, day=28, year=d.year + years)


def _add_months(d: date, months: int) -> date:
    """Add months to a date while preserving day as much as possible."""
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(d.day, last_day)
    return date(year, month, day)


def _month_index_bucket(start: date, event: date) -> int:
    """Bucket date to 1-based month index by calendar month (year + month)."""
    return (event.year - start.year) * 12 + (event.month - start.month) + 1


def _clamp_period_to_month_indices(
    *,
    startdatum: date,
    enddatum_horizon: date,
    total_months: int,
    periode_start: date | None,
    periode_eind: date | None,
) -> tuple[int, int]:
    """Convert optional date range to inclusive month indices in [1, total_months]."""
    if total_months <= 0:
        return (1, 0)

    s = periode_start or startdatum
    e = periode_eind or enddatum_horizon
    if s < startdatum:
        s = startdatum
    if e > enddatum_horizon:
        e = enddatum_horizon

    start_idx = max(1, min(total_months, _month_index_bucket(startdatum, s)))
    end_idx = max(1, min(total_months, _month_index_bucket(startdatum, e)))
    
    # Bugfix: Als de einddatum voor de startdatum valt, retourneer een ongeldige range
    # zodat de loop er in de maand-iteratie niet in trapt.
    if end_idx < start_idx:
        return (1, 0)
    return (start_idx, end_idx)


def _profiel_for_remaining_years(remaining_years: float) -> str:
    if remaining_years > 14:
        return "Zeer offensief"
    if remaining_years >= 10:
        return "Offensief"
    if remaining_years >= 8:
        return "Neutraal"
    if remaining_years >= 6:
        return "Matig defensief"
    if remaining_years > 3:
        return "Defensief"
    return "Niet beleggen"


_PROFIEL_ORDER_MOST_OFFENSIVE_TO_DEFENSIVE = [
    "Zeer offensief",
    "Offensief",
    "Neutraal",
    "Matig defensief",
    "Defensief",
    "Niet beleggen",
]

_PROFIEL_RANK: dict[str, int] = {
    p: i for i, p in enumerate(_PROFIEL_ORDER_MOST_OFFENSIVE_TO_DEFENSIVE)
}


def _more_defensive_profiel(a: str, b: str) -> str:
    ra = _PROFIEL_RANK.get(a, _PROFIEL_RANK["Niet beleggen"])
    rb = _PROFIEL_RANK.get(b, _PROFIEL_RANK["Niet beleggen"])
    return a if ra >= rb else b


def _profiel_with_afbouw(start_profiel: str, total_months: int, month_index: int) -> str:
    remaining_years = max(0.0, (total_months - (month_index - 1)) / 12.0)
    auto_profiel = _profiel_for_remaining_years(remaining_years)
    profiel_maand = _more_defensive_profiel(start_profiel, auto_profiel)
    if remaining_years > 3.0 and profiel_maand == "Niet beleggen":
        return "Defensief"
    return profiel_maand


def _safe_float(value: float) -> float:
    if not np.isfinite(value):
        return 0.0
    return float(value)


def _safe_stat_mean(values: np.ndarray) -> float:
    return _safe_float(float(np.mean(values)))


def _safe_stat_percentile(values: np.ndarray, pct: float) -> float:
    return _safe_float(float(np.percentile(values, pct)))


# --- NIEUWE GEVECTORISEERDE HELPERS ---

class SimulationResult(TypedDict):
    end_values_bruto: np.ndarray
    end_values_netto: np.ndarray
    monthly_paths_bruto: np.ndarray
    monthly_paths_netto: np.ndarray
    monthly_net_cashflow: np.ndarray
    monthly_cumulative_costs: np.ndarray
    monthly_net_shortfall: np.ndarray
    realized_deposits: np.ndarray
    realized_withdrawals_bruto: np.ndarray
    realized_withdrawals_netto: np.ndarray
    total_costs_paid: np.ndarray
    total_management_costs_paid: np.ndarray
    total_fund_costs_paid: np.ndarray
    total_spread_costs_paid: np.ndarray
    costs_base_sum: np.ndarray
    has_withdrawal_shortfall: np.ndarray
    total_withdrawal_shortfall_netto: np.ndarray


def _apply_withdrawal_request_vectorized(requested: float, current_values: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    req = max(0.0, float(requested))
    actual_paid = np.minimum(req, np.maximum(0.0, current_values))
    new_values = np.maximum(0.0, current_values - req)
    shortfalls = req - actual_paid
    return new_values, actual_paid, shortfalls


def _bereken_maandkosten_componenten_vectorized(waarden: np.ndarray, is_bloei_plus: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    beheer = np.zeros_like(waarden)
    amount = waarden.copy()

    if is_bloei_plus:
        T1, B1 = 1_000_000.0, 0.70 / 100.0
        T2, B2 = 2_500_000.0, 0.60 / 100.0
        T3, B3 = 5_000_000.0, 0.50 / 100.0
        T4, B4 = 10_000_000.0, 0.40 / 100.0
        B5 = 0.30 / 100.0

        amt1 = np.clip(amount, 0, T1)
        beheer += amt1 * B1
        amount -= amt1

        amt2 = np.clip(amount, 0, T2 - T1)
        beheer += amt2 * B2
        amount -= amt2

        amt3 = np.clip(amount, 0, T3 - T2)
        beheer += amt3 * B3
        amount -= amt3

        amt4 = np.clip(amount, 0, T4 - T3)
        beheer += amt4 * B4
        amount -= amt4

        beheer += np.maximum(0, amount) * B5
    else:
        T1, B1 = 100_000.0, 0.60 / 100.0
        T2, B2 = 1_000_000.0, 0.50 / 100.0
        B3 = 0.40 / 100.0

        amt1 = np.clip(amount, 0, T1)
        beheer += amt1 * B1
        amount -= amt1

        amt2 = np.clip(amount, 0, T2 - T1)
        beheer += amt2 * B2
        amount -= amt2

        beheer += np.maximum(0, amount) * B3

    fonds = waarden * (0.17 / 100.0)
    spread = waarden * (0.01 / 100.0)

    return beheer / 12.0, fonds / 12.0, spread / 12.0


# --- GEVECTORISEERDE SIMULATIE ---

def _simulate_all_scenarios(
    inp: RekenInput,
    total_months: int,
    cashflows_by_month_begin: dict[int, list[EenmaligeCashflow]],
    cashflows_end_of_horizon: list[EenmaligeCashflow],
    storting_start_idx: int,
    storting_end_idx: int,
    onttrekking_start_idx: int,
    onttrekking_end_idx: int,
    verwacht_rendement_by_profiel: dict[str, float],
    volatiliteit_by_profiel: dict[str, float],
    start_profiel: str,
    rng: np.random.Generator,
) -> SimulationResult:
    N = inp.n_scenarios
    
    current_bruto = np.full(N, float(inp.startvermogen))
    current_netto = np.full(N, float(inp.startvermogen))
    
    realized_deposits = np.full(N, float(inp.startvermogen))
    realized_withdrawals_bruto = np.zeros(N)
    realized_withdrawals_netto = np.zeros(N)
    total_withdrawal_shortfall_netto = np.zeros(N)
    has_withdrawal_shortfall = np.zeros(N, dtype=bool)

    total_costs_paid = np.zeros(N)
    total_management_costs_paid = np.zeros(N)
    total_fund_costs_paid = np.zeros(N)
    total_spread_costs_paid = np.zeros(N)
    costs_base_sum = np.zeros(N)

    monthly_values_bruto = np.zeros((total_months + 1, N))
    monthly_values_netto = np.zeros((total_months + 1, N))
    monthly_net_cashflow = np.zeros((total_months + 1, N))
    monthly_cumulative_costs = np.zeros((total_months + 1, N))
    monthly_net_shortfall = np.zeros((total_months + 1, N))

    monthly_values_bruto[0, :] = current_bruto
    monthly_values_netto[0, :] = current_netto

    mu_array = np.zeros(total_months)
    sigma_array = np.zeros(total_months)
    is_niet_beleggen = np.zeros(total_months, dtype=bool)

    for m in range(1, total_months + 1):
        p = _profiel_with_afbouw(start_profiel, total_months, m) if inp.afbouw_profiel else start_profiel
        if p == "Niet beleggen":
            is_niet_beleggen[m-1] = True
        else:
            mu_array[m-1] = float(verwacht_rendement_by_profiel.get(p, 0.0)) / 100.0 / 12.0
            sigma_array[m-1] = float(volatiliteit_by_profiel.get(p, 0.0)) / 100.0 / sqrt(12.0)

    # Gebruik broadcasting ([:, None]) om de 1D mu/sigma arrays verticaal te 'rekken' over alle N scenario's.
    # Dit genereert een (total_months x N) matrix met unieke willekeurige rendementen per maand en per scenario.
    r_matrix = rng.normal(mu_array[:, None], sigma_array[:, None], size=(total_months, N))
    growth_matrix = 1.0 + r_matrix

    for month in range(1, total_months + 1):
        # Intra-month volgorde (bewuste keuze):
        #   1. Eenmalige cashflows (begin-van-maand)  → verdienen rendement deze maand
        #   2. Rendement (groei)
        #   3. Kosten (afgetrokken van netto)
        #   4. Periodieke stortingen (eind-van-maand) → verdienen GEEN rendement deze maand
        #   5. Periodieke onttrekkingen (eind-van-maand)
        # Dit betekent dat eenmalige stortingen meer kosten/rendement genereren dan periodieke
        # stortingen in dezelfde maand; dit is de standaard begin/eind-van-maand conventie.
        net_cashflow_month = np.zeros(N)
        shortfall_month = np.zeros(N)

        for cf in cashflows_by_month_begin.get(month, []):
            if cf.type == "storting":
                current_bruto += cf.bedrag
                current_netto += cf.bedrag
                realized_deposits += cf.bedrag
                net_cashflow_month += cf.bedrag
            else:
                current_bruto, pb, sb = _apply_withdrawal_request_vectorized(cf.bedrag, current_bruto)
                current_netto, pn, sn = _apply_withdrawal_request_vectorized(cf.bedrag, current_netto)
                realized_withdrawals_bruto += pb
                realized_withdrawals_netto += pn
                total_withdrawal_shortfall_netto += sn
                has_withdrawal_shortfall |= (sn > 0)
                net_cashflow_month -= cf.bedrag
                shortfall_month += sn

        if not is_niet_beleggen[month-1]:
            growth = np.maximum(growth_matrix[month-1], -1.0)
            current_bruto = np.where(current_bruto > 0, current_bruto * growth, current_bruto)
            current_netto = np.where(current_netto > 0, current_netto * growth, current_netto)

        if not is_niet_beleggen[month-1]:
            mask_pos = current_netto > 0
            costs_base_sum += np.where(mask_pos, current_netto, 0.0)

            beheer, fonds, spread = _bereken_maandkosten_componenten_vectorized(
                np.where(mask_pos, current_netto, 0.0), inp.is_bloei_plus
            )
            tot_kosten = beheer + fonds + spread

            current_netto -= tot_kosten
            total_management_costs_paid += beheer
            total_fund_costs_paid += fonds
            total_spread_costs_paid += spread
            total_costs_paid += tot_kosten

        if inp.periodieke_storting_maandelijks > 0 and storting_start_idx <= month <= storting_end_idx:
            val = inp.periodieke_storting_maandelijks
            current_bruto += val
            current_netto += val
            realized_deposits += val
            net_cashflow_month += val

        if inp.periodieke_onttrekking_maandelijks > 0 and onttrekking_start_idx <= month <= onttrekking_end_idx:
            req = inp.periodieke_onttrekking_maandelijks
            current_bruto, pb, sb = _apply_withdrawal_request_vectorized(req, current_bruto)
            current_netto, pn, sn = _apply_withdrawal_request_vectorized(req, current_netto)
            realized_withdrawals_bruto += pb
            realized_withdrawals_netto += pn
            total_withdrawal_shortfall_netto += sn
            has_withdrawal_shortfall |= (sn > 0)
            net_cashflow_month -= req
            shortfall_month += sn

        current_bruto = np.maximum(0.0, current_bruto)
        current_netto = np.maximum(0.0, current_netto)

        monthly_values_bruto[month, :] = current_bruto
        monthly_values_netto[month, :] = current_netto
        monthly_net_cashflow[month, :] = net_cashflow_month
        monthly_cumulative_costs[month, :] = total_costs_paid
        monthly_net_shortfall[month, :] = shortfall_month

    end_cashflow_net = np.zeros(N)
    end_shortfall_net = np.zeros(N)
    
    for cf in cashflows_end_of_horizon:
        if cf.type == "storting":
            current_bruto += cf.bedrag
            current_netto += cf.bedrag
            realized_deposits += cf.bedrag
            end_cashflow_net += cf.bedrag
        else:
            current_bruto, pb, sb = _apply_withdrawal_request_vectorized(cf.bedrag, current_bruto)
            current_netto, pn, sn = _apply_withdrawal_request_vectorized(cf.bedrag, current_netto)
            realized_withdrawals_bruto += pb
            realized_withdrawals_netto += pn
            total_withdrawal_shortfall_netto += sn
            has_withdrawal_shortfall |= (sn > 0)
            end_cashflow_net -= cf.bedrag
            end_shortfall_net += sn

    current_bruto = np.maximum(0.0, current_bruto)
    current_netto = np.maximum(0.0, current_netto)

    monthly_values_bruto[-1, :] = current_bruto
    monthly_values_netto[-1, :] = current_netto
    monthly_net_cashflow[-1, :] += end_cashflow_net
    monthly_net_shortfall[-1, :] += end_shortfall_net

    return {
        "end_values_bruto": current_bruto,
        "end_values_netto": current_netto,
        "monthly_paths_bruto": monthly_values_bruto,
        "monthly_paths_netto": monthly_values_netto,
        "monthly_net_cashflow": monthly_net_cashflow,
        "monthly_cumulative_costs": monthly_cumulative_costs,
        "monthly_net_shortfall": monthly_net_shortfall,
        "realized_deposits": realized_deposits,
        "realized_withdrawals_bruto": realized_withdrawals_bruto,
        "realized_withdrawals_netto": realized_withdrawals_netto,
        "total_costs_paid": total_costs_paid,
        "total_management_costs_paid": total_management_costs_paid,
        "total_fund_costs_paid": total_fund_costs_paid,
        "total_spread_costs_paid": total_spread_costs_paid,
        "costs_base_sum": costs_base_sum,
        "has_withdrawal_shortfall": has_withdrawal_shortfall,
        "total_withdrawal_shortfall_netto": total_withdrawal_shortfall_netto
    }


def bereken_kosten(inp: RekenInput) -> RekenOutput:
    """Calculate projections under MiFID II compliance, fully vectorized."""

    verwacht_rendement_by_profiel = (
        inp.custom_rendement_dict
        if inp.custom_rendement_dict is not None
        else {
            "Defensief": 3.7116,
            "Matig defensief": 4.6732,
            "Neutraal": 5.6348,
            "Offensief": 6.5964,
            "Zeer offensief": 7.558,
            "Niet beleggen": 0.0,
        }
    )
    volatiliteit_by_profiel = (
        inp.custom_volatiliteit_dict
        if inp.custom_volatiliteit_dict is not None
        else {
            "Defensief": 5.23,
            "Matig defensief": 7.02,
            "Neutraal": 9.26,
            "Offensief": 11.71,
            "Zeer offensief": 14.38,
            "Niet beleggen": 0.0,
        }
    )

    start_profiel = inp.profiel
    verwacht_rendement_pct = float(verwacht_rendement_by_profiel.get(start_profiel, 0.0))

    total_months = inp.horizon_jaren * 12
    end_date = _add_years(inp.startdatum, inp.horizon_jaren)

    cashflows_by_month_begin: dict[int, list[EenmaligeCashflow]] = {}
    cashflows_end_of_horizon: list[EenmaligeCashflow] = []

    for cashflow in inp.eenmalige_cashflows:
        if cashflow.datum < inp.startdatum or cashflow.datum > end_date:
            continue

        if cashflow.datum == end_date:
            cashflows_end_of_horizon.append(cashflow)
            continue

        idx = _month_index_bucket(inp.startdatum, cashflow.datum)
        if 1 <= idx <= total_months:
            cashflows_by_month_begin.setdefault(idx, []).append(cashflow)

    storting_start_idx, storting_end_idx = _clamp_period_to_month_indices(
        startdatum=inp.startdatum,
        enddatum_horizon=end_date,
        total_months=total_months,
        periode_start=inp.periodieke_storting_startdatum,
        periode_eind=inp.periodieke_storting_einddatum,
    )
    onttrekking_start_idx, onttrekking_end_idx = _clamp_period_to_month_indices(
        startdatum=inp.startdatum,
        enddatum_horizon=end_date,
        total_months=total_months,
        periode_start=inp.periodieke_onttrekking_startdatum,
        periode_eind=inp.periodieke_onttrekking_einddatum,
    )

    rng = np.random.default_rng(seed=inp.rng_seed)
    
    results = _simulate_all_scenarios(
        inp=inp,
        total_months=total_months,
        cashflows_by_month_begin=cashflows_by_month_begin,
        cashflows_end_of_horizon=cashflows_end_of_horizon,
        storting_start_idx=storting_start_idx,
        storting_end_idx=storting_end_idx,
        onttrekking_start_idx=onttrekking_start_idx,
        onttrekking_end_idx=onttrekking_end_idx,
        verwacht_rendement_by_profiel=verwacht_rendement_by_profiel,
        volatiliteit_by_profiel=volatiliteit_by_profiel,
        start_profiel=start_profiel,
        rng=rng,
    )

    end_values_bruto_arr = results["end_values_bruto"]
    end_values_netto_arr = results["end_values_netto"]

    profits_bruto_arr = end_values_bruto_arr - results["realized_deposits"] + results["realized_withdrawals_bruto"]
    profits_netto_arr = end_values_netto_arr - results["realized_deposits"] + results["realized_withdrawals_netto"]

    monthly_paths_bruto_arr = results["monthly_paths_bruto"]
    monthly_paths_netto_arr = results["monthly_paths_netto"]
    monthly_net_cashflow_arr = results["monthly_net_cashflow"]
    monthly_net_shortfall_arr = results["monthly_net_shortfall"]
    monthly_cumulative_costs_arr = results["monthly_cumulative_costs"]

    # Kosten 1e jaar: mediaan van de werkelijke cumulatieve kosten na 12 maanden
    year1_end_idx = min(12, total_months)
    kosten_eur_jaar1 = _safe_float(float(np.median(monthly_cumulative_costs_arr[year1_end_idx, :])))
    kosten_pct_jaar1 = (
        _safe_float((kosten_eur_jaar1 / inp.startvermogen) * 100.0) if inp.startvermogen > 0 else 0.0
    )

    verwacht_eindvermogen_bruto = _safe_stat_percentile(end_values_bruto_arr, 50)
    verwacht_eindvermogen_netto = _safe_stat_percentile(end_values_netto_arr, 50)

    verwacht_eindvermogen_p10_netto = _safe_stat_percentile(end_values_netto_arr, 10)
    verwacht_eindvermogen_p20_netto = _safe_stat_percentile(end_values_netto_arr, 20)
    verwacht_eindvermogen_p40_netto = _safe_stat_percentile(end_values_netto_arr, 40)
    verwacht_eindvermogen_p50_netto = _safe_stat_percentile(end_values_netto_arr, 50)
    verwacht_eindvermogen_p60_netto = _safe_stat_percentile(end_values_netto_arr, 60)
    verwacht_eindvermogen_p80_netto = _safe_stat_percentile(end_values_netto_arr, 80)
    verwacht_eindvermogen_p90_netto = _safe_stat_percentile(end_values_netto_arr, 90)

    verwachte_winst_bruto = _safe_stat_percentile(profits_bruto_arr, 50)
    verwachte_winst_netto = _safe_stat_percentile(profits_netto_arr, 50)

    totale_kosten_betaald = _safe_stat_percentile(results["total_costs_paid"], 50)
    totale_kosten_impact = max(0.0, verwachte_winst_bruto - verwachte_winst_netto)
    misgelopen_rendement_op_kosten = max(0.0, totale_kosten_impact - totale_kosten_betaald)
    totale_beheerkosten_betaald = _safe_stat_percentile(results["total_management_costs_paid"], 50)
    totale_fondskosten_betaald = _safe_stat_percentile(results["total_fund_costs_paid"], 50)
    totale_spreadkosten_betaald = _safe_stat_percentile(results["total_spread_costs_paid"], 50)
    costs_base_sum = _safe_stat_percentile(results["costs_base_sum"], 50)
    
    if costs_base_sum > 0:
        gemiddelde_beheerkosten_pct = _safe_float((totale_beheerkosten_betaald * 12.0 / costs_base_sum) * 100.0)
        gemiddelde_fondskosten_pct = _safe_float((totale_fondskosten_betaald * 12.0 / costs_base_sum) * 100.0)
        gemiddelde_spreadkosten_pct = _safe_float((totale_spreadkosten_betaald * 12.0 / costs_base_sum) * 100.0)
    else:
        gemiddelde_beheerkosten_pct = 0.0
        gemiddelde_fondskosten_pct = 0.0
        gemiddelde_spreadkosten_pct = 0.0
    gemiddelde_totale_kosten_pct = _safe_float(
        gemiddelde_beheerkosten_pct + gemiddelde_fondskosten_pct + gemiddelde_spreadkosten_pct
    )

    faalkans = float(np.clip(np.mean(results["has_withdrawal_shortfall"]), 0.0, 1.0))
    verwacht_onttrekkingstekort = _safe_stat_mean(results["total_withdrawal_shortfall_netto"])

    # Genereer de verdeling van het eindvermogen (percentiel 1 t/m 99)
    verdeling_eindvermogen_percentielen = [
        _safe_float(x) for x in np.percentile(end_values_netto_arr, range(1, 100))
    ]

    tijdlijn_vermogen_bruto = [_safe_float(x) for x in np.percentile(monthly_paths_bruto_arr, 50, axis=1)]
    tijdlijn_vermogen_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 50, axis=1)]

    tijdlijn_vermogen_p10_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 10, axis=1)]
    tijdlijn_vermogen_p20_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 20, axis=1)]
    tijdlijn_vermogen_p40_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 40, axis=1)]
    tijdlijn_vermogen_p50_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 50, axis=1)]
    tijdlijn_vermogen_p60_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 60, axis=1)]
    tijdlijn_vermogen_p80_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 80, axis=1)]
    tijdlijn_vermogen_p90_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 90, axis=1)]
    
    tijdlijn_cashflow_netto = [_safe_float(x) for x in np.mean(monthly_net_cashflow_arr, axis=1)]
    tijdlijn_kosten_cumulatief = [_safe_float(x) for x in np.mean(monthly_cumulative_costs_arr, axis=1)]
    tijdlijn_tekort = [_safe_float(x) for x in np.mean(monthly_net_shortfall_arr, axis=1)]

    tijdlijn_datums = [_add_months(inp.startdatum, month) for month in range(0, total_months + 1)]
    tijdlijn_profiel = [start_profiel]
    for month in range(1, total_months + 1):
        if inp.afbouw_profiel:
            tijdlijn_profiel.append(_profiel_with_afbouw(start_profiel, total_months, month))
        else:
            tijdlijn_profiel.append(inp.profiel)

    return RekenOutput(
        kosten_eur_jaar1=max(0.0, kosten_eur_jaar1),
        kosten_pct_jaar1=max(0.0, kosten_pct_jaar1),
        verwacht_rendement_pct=_safe_float(verwacht_rendement_pct),

        verwacht_eindvermogen_bruto=verwacht_eindvermogen_bruto,
        verwacht_eindvermogen_netto=verwacht_eindvermogen_netto,
        totale_kosten_betaald=max(0.0, totale_kosten_betaald),
        misgelopen_rendement_op_kosten=max(0.0, misgelopen_rendement_op_kosten),
        totale_kosten_impact=max(0.0, totale_kosten_impact),
        totale_beheerkosten_betaald=max(0.0, totale_beheerkosten_betaald),
        totale_fondskosten_betaald=max(0.0, totale_fondskosten_betaald),
        totale_spreadkosten_betaald=max(0.0, totale_spreadkosten_betaald),
        gemiddelde_beheerkosten_pct=max(0.0, gemiddelde_beheerkosten_pct),
        gemiddelde_fondskosten_pct=max(0.0, gemiddelde_fondskosten_pct),
        gemiddelde_spreadkosten_pct=max(0.0, gemiddelde_spreadkosten_pct),
        gemiddelde_totale_kosten_pct=max(0.0, gemiddelde_totale_kosten_pct),

        verwachte_winst_bruto=_safe_float(verwachte_winst_bruto),
        verwachte_winst_netto=_safe_float(verwachte_winst_netto),

        verwacht_eindvermogen_p10_netto=verwacht_eindvermogen_p10_netto,
        verwacht_eindvermogen_p20_netto=verwacht_eindvermogen_p20_netto,
        verwacht_eindvermogen_p40_netto=verwacht_eindvermogen_p40_netto,
        verwacht_eindvermogen_p50_netto=verwacht_eindvermogen_p50_netto,
        verwacht_eindvermogen_p60_netto=verwacht_eindvermogen_p60_netto,
        verwacht_eindvermogen_p80_netto=verwacht_eindvermogen_p80_netto,
        verwacht_eindvermogen_p90_netto=verwacht_eindvermogen_p90_netto,

        faalkans=max(0.0, min(1.0, _safe_float(faalkans))),
        verwacht_onttrekkingstekort=max(0.0, _safe_float(verwacht_onttrekkingstekort)),

        verdeling_eindvermogen_percentielen=verdeling_eindvermogen_percentielen,

        tijdlijn_datums=tijdlijn_datums,
        tijdlijn_vermogen_bruto=tijdlijn_vermogen_bruto,
        tijdlijn_vermogen_netto=tijdlijn_vermogen_netto,
        tijdlijn_vermogen_p10_netto=tijdlijn_vermogen_p10_netto,
        tijdlijn_vermogen_p20_netto=tijdlijn_vermogen_p20_netto,
        tijdlijn_vermogen_p40_netto=tijdlijn_vermogen_p40_netto,
        tijdlijn_vermogen_p50_netto=tijdlijn_vermogen_p50_netto,
        tijdlijn_vermogen_p60_netto=tijdlijn_vermogen_p60_netto,
        tijdlijn_vermogen_p80_netto=tijdlijn_vermogen_p80_netto,
        tijdlijn_vermogen_p90_netto=tijdlijn_vermogen_p90_netto,
        tijdlijn_profiel=tijdlijn_profiel,
        tijdlijn_cashflow_netto=tijdlijn_cashflow_netto,
        tijdlijn_kosten_cumulatief=tijdlijn_kosten_cumulatief,
        tijdlijn_tekort=tijdlijn_tekort,
    )
