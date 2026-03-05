"""Pure calculation logic for the Bloei Rekenmodule."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import sqrt
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
    """Add months to a date while preserving day as much as possible.

    Example: 2026-01-31 + 1 month -> 2026-02-28.
    """
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
    if end_idx < start_idx:
        end_idx = start_idx
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


def _more_defensive_profiel(a: str, b: str) -> str:
    rank = {p: i for i, p in enumerate(_PROFIEL_ORDER_MOST_OFFENSIVE_TO_DEFENSIVE)}
    ra = rank.get(a, rank["Niet beleggen"])
    rb = rank.get(b, rank["Niet beleggen"])
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


def _bereken_maandkosten_componenten(waarde: float) -> tuple[float, float, float]:
    """Berekent maandkosten uitgesplitst naar (beheer, fonds, spread)."""
    if waarde <= 0:
        return (0.0, 0.0, 0.0)

    TIER_1_MAX = 100_000.0
    TIER_2_MAX = 1_000_000.0
    BEHEERKOSTEN_TIER_1 = 0.60 / 100.0
    BEHEERKOSTEN_TIER_2 = 0.50 / 100.0
    BEHEERKOSTEN_TIER_3 = 0.40 / 100.0
    FONDSKOSTEN = 0.17 / 100.0
    SPREADKOSTEN = 0.01 / 100.0

    beheerkosten_jaar = 0.0
    amount = waarde

    tier_1_amount = min(amount, TIER_1_MAX)
    beheerkosten_jaar += tier_1_amount * BEHEERKOSTEN_TIER_1
    amount -= tier_1_amount

    if amount > 0:
        tier_2_amount = min(amount, TIER_2_MAX - TIER_1_MAX)
        beheerkosten_jaar += tier_2_amount * BEHEERKOSTEN_TIER_2
        amount -= tier_2_amount

    if amount > 0:
        beheerkosten_jaar += amount * BEHEERKOSTEN_TIER_3

    fondskosten_jaar = waarde * FONDSKOSTEN
    spreadkosten_jaar = waarde * SPREADKOSTEN
    return (
        _safe_float(beheerkosten_jaar / 12.0),
        _safe_float(fondskosten_jaar / 12.0),
        _safe_float(spreadkosten_jaar / 12.0),
    )


def _bereken_maandkosten(waarde: float) -> float:
    """Berekent de totale kosten (beheer, fonds, spread) voor 1 maand."""
    beheer, fonds, spread = _bereken_maandkosten_componenten(waarde)
    return _safe_float(beheer + fonds + spread)


@dataclass
class _ScenarioResult:
    end_value_bruto: float
    end_value_netto: float
    realized_deposits: float
    realized_withdrawals_bruto: float
    realized_withdrawals_netto: float
    total_withdrawal_shortfall_netto: float
    has_withdrawal_shortfall: bool
    total_costs_paid: float
    total_management_costs_paid: float
    total_fund_costs_paid: float
    total_spread_costs_paid: float
    costs_base_sum: float
    monthly_values_bruto: list[float]
    monthly_values_netto: list[float]
    monthly_net_cashflow: list[float]
    monthly_cumulative_costs: list[float]
    monthly_net_shortfall: list[float]


def _apply_withdrawal_request(*, requested: float, current_value: float) -> tuple[float, float, float]:
    """Apply a withdrawal request to a single account.

    Returns: (new_value, actual_paid, shortfall)
    """
    requested = max(0.0, float(requested))
    current_value = float(current_value)
    
    # Wat is er écht beschikbaar in de pot?
    actual_paid = min(requested, max(0.0, current_value))
    
    # Het vermogen mag echter niet negatief worden en krijgt een bodem van 0
    new_value = max(0.0, current_value - requested)
    
    # Shortfall is het deel van het verzoek dat we niet konden betalen
    shortfall = requested - actual_paid
    
    return (new_value, actual_paid, shortfall)


def _simulate_single_scenario(
    *,
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
) -> _ScenarioResult:
    """Simulate one path.

    - Simple return model: return ~ Normal, wealth *= (1 + r)

    Costs:
    - Applied monthly on netto only.
    - If profiel == "Niet beleggen" (cash), no costs are charged.

    Withdrawals:
    - Modelled as requests; shortfalls are recorded.
    """

    current_bruto = float(inp.startvermogen)
    current_netto = float(inp.startvermogen)

    realized_deposits = float(inp.startvermogen)
    realized_withdrawals_bruto = 0.0
    realized_withdrawals_netto = 0.0

    total_withdrawal_shortfall_netto = 0.0
    has_withdrawal_shortfall = False

    total_costs_paid = 0.0
    total_management_costs_paid = 0.0
    total_fund_costs_paid = 0.0
    total_spread_costs_paid = 0.0
    costs_base_sum = 0.0

    monthly_values_bruto = [current_bruto]
    monthly_values_netto = [current_netto]
    monthly_net_cashflow = [0.0]
    monthly_cumulative_costs = [0.0]
    monthly_net_shortfall = [0.0]

    if total_months == 0:
        # Apply end-of-horizon cashflows immediately (horizon marker == start)
        end_cashflow_net = 0.0
        end_shortfall_net = 0.0
        for cf in cashflows_end_of_horizon:
            if cf.type == "storting":
                current_bruto += cf.bedrag
                current_netto += cf.bedrag
                realized_deposits += cf.bedrag
                end_cashflow_net += cf.bedrag
            else:
                current_bruto, paid_b, shortfall_b = _apply_withdrawal_request(requested=cf.bedrag, current_value=current_bruto)
                current_netto, paid_n, shortfall_n = _apply_withdrawal_request(requested=cf.bedrag, current_value=current_netto)
                realized_withdrawals_bruto += paid_b
                realized_withdrawals_netto += paid_n
                if shortfall_n > 0:
                    total_withdrawal_shortfall_netto += shortfall_n
                    has_withdrawal_shortfall = True
                end_cashflow_net -= cf.bedrag
                end_shortfall_net += shortfall_n

        current_bruto = _safe_float(current_bruto)
        current_netto = _safe_float(current_netto)
        monthly_values_bruto[-1] = current_bruto
        monthly_values_netto[-1] = current_netto
        monthly_net_cashflow[-1] = _safe_float(end_cashflow_net)
        monthly_net_shortfall[-1] = _safe_float(end_shortfall_net)

        return _ScenarioResult(
            end_value_bruto=current_bruto,
            end_value_netto=current_netto,
            realized_deposits=realized_deposits,
            realized_withdrawals_bruto=realized_withdrawals_bruto,
            realized_withdrawals_netto=realized_withdrawals_netto,
            total_withdrawal_shortfall_netto=_safe_float(total_withdrawal_shortfall_netto),
            has_withdrawal_shortfall=bool(has_withdrawal_shortfall),
            total_costs_paid=_safe_float(total_costs_paid),
            total_management_costs_paid=_safe_float(total_management_costs_paid),
            total_fund_costs_paid=_safe_float(total_fund_costs_paid),
            total_spread_costs_paid=_safe_float(total_spread_costs_paid),
            costs_base_sum=_safe_float(costs_base_sum),
            monthly_values_bruto=monthly_values_bruto,
            monthly_values_netto=monthly_values_netto,
            monthly_net_cashflow=monthly_net_cashflow,
            monthly_cumulative_costs=monthly_cumulative_costs,
            monthly_net_shortfall=monthly_net_shortfall,
        )

    for month in range(1, total_months + 1):
        net_cashflow_month = 0.0
        shortfall_month = 0.0

        # 1) One-time flows at BEGINNING of month
        for cashflow in cashflows_by_month_begin.get(month, []):
            if cashflow.type == "storting":
                current_bruto += cashflow.bedrag
                current_netto += cashflow.bedrag
                realized_deposits += cashflow.bedrag
                net_cashflow_month += cashflow.bedrag
            else:
                current_bruto, paid_b, shortfall_b = _apply_withdrawal_request(requested=cashflow.bedrag, current_value=current_bruto)
                current_netto, paid_n, shortfall_n = _apply_withdrawal_request(requested=cashflow.bedrag, current_value=current_netto)
                realized_withdrawals_bruto += paid_b
                realized_withdrawals_netto += paid_n
                if shortfall_n > 0:
                    total_withdrawal_shortfall_netto += shortfall_n
                    has_withdrawal_shortfall = True
                net_cashflow_month -= cashflow.bedrag
                shortfall_month += shortfall_n

        # 2) Determine profile for this month
        if inp.afbouw_profiel:
            profiel_maand = _profiel_with_afbouw(start_profiel, total_months, month)
        else:
            profiel_maand = inp.profiel

        # 3) Apply return
        annual_return = float(verwacht_rendement_by_profiel.get(profiel_maand, 0.0)) / 100.0
        annual_volatility = float(volatiliteit_by_profiel.get(profiel_maand, 0.0)) / 100.0

        if profiel_maand == "Niet beleggen":
            # Cash semantics: no market risk, no costs.
            current_bruto = _safe_float(current_bruto)
            current_netto = _safe_float(current_netto)
        else:
            # Simple-return model: wealth *= (1 + r)
            sigma_month = annual_volatility / sqrt(12.0)
            mu_month = annual_return / 12.0
            r_month = float(rng.normal(mu_month, sigma_month))
            growth = (1.0 + r_month)

            # Marktrendement geldt alleen over positief saldo.
            # Een negatief saldo is een papieren tekort en belegt niet mee.
            if current_bruto > 0:
                current_bruto *= growth
            if current_netto > 0:
                current_netto *= growth

            current_bruto = _safe_float(current_bruto)
            current_netto = _safe_float(current_netto)

        # 4) Costs (netto only; zero costs for cash)
        if profiel_maand != "Niet beleggen" and current_netto > 0:
            costs_base_sum += _safe_float(current_netto)
            kosten_beheer, kosten_fonds, kosten_spread = _bereken_maandkosten_componenten(current_netto)
            kosten_deze_maand = kosten_beheer + kosten_fonds + kosten_spread
            current_netto -= kosten_deze_maand
            total_management_costs_paid += _safe_float(kosten_beheer)
            total_fund_costs_paid += _safe_float(kosten_fonds)
            total_spread_costs_paid += _safe_float(kosten_spread)
            total_costs_paid += _safe_float(kosten_deze_maand)
            current_netto = _safe_float(current_netto)

        # 5) Periodic flows at END of month
        if inp.periodieke_storting_maandelijks > 0 and storting_start_idx <= month <= storting_end_idx:
            current_bruto += inp.periodieke_storting_maandelijks
            current_netto += inp.periodieke_storting_maandelijks
            realized_deposits += inp.periodieke_storting_maandelijks
            net_cashflow_month += inp.periodieke_storting_maandelijks

        if inp.periodieke_onttrekking_maandelijks > 0 and onttrekking_start_idx <= month <= onttrekking_end_idx:
            req = inp.periodieke_onttrekking_maandelijks
            current_bruto, paid_b, shortfall_b = _apply_withdrawal_request(requested=req, current_value=current_bruto)
            current_netto, paid_n, shortfall_n = _apply_withdrawal_request(requested=req, current_value=current_netto)
            realized_withdrawals_bruto += paid_b
            realized_withdrawals_netto += paid_n
            if shortfall_n > 0:
                total_withdrawal_shortfall_netto += shortfall_n
                has_withdrawal_shortfall = True
            net_cashflow_month -= req
            shortfall_month += shortfall_n

        # 6) Floor: vermogen mag niet negatief worden
        current_bruto = max(0.0, _safe_float(current_bruto))
        current_netto = max(0.0, _safe_float(current_netto))

        monthly_values_bruto.append(current_bruto)
        monthly_values_netto.append(current_netto)
        monthly_net_cashflow.append(_safe_float(net_cashflow_month))
        monthly_cumulative_costs.append(_safe_float(total_costs_paid))
        monthly_net_shortfall.append(_safe_float(shortfall_month))

    # 7) Apply cashflows exactly at the horizon end marker (END of final month)
    end_cashflow_net = 0.0
    end_shortfall_net = 0.0
    for cashflow in cashflows_end_of_horizon:
        if cashflow.type == "storting":
            current_bruto += cashflow.bedrag
            current_netto += cashflow.bedrag
            realized_deposits += cashflow.bedrag
            end_cashflow_net += cashflow.bedrag
        else:
            current_bruto, paid_b, shortfall_b = _apply_withdrawal_request(requested=cashflow.bedrag, current_value=current_bruto)
            current_netto, paid_n, shortfall_n = _apply_withdrawal_request(requested=cashflow.bedrag, current_value=current_netto)
            realized_withdrawals_bruto += paid_b
            realized_withdrawals_netto += paid_n
            if shortfall_n > 0:
                total_withdrawal_shortfall_netto += shortfall_n
                has_withdrawal_shortfall = True
            end_cashflow_net -= cashflow.bedrag
            end_shortfall_net += shortfall_n

    current_bruto = max(0.0, _safe_float(current_bruto))
    current_netto = max(0.0, _safe_float(current_netto))

    # Update final timeline point to reflect end-of-horizon cashflows
    monthly_values_bruto[-1] = current_bruto
    monthly_values_netto[-1] = current_netto
    monthly_net_cashflow[-1] = _safe_float(monthly_net_cashflow[-1] + end_cashflow_net)
    monthly_net_shortfall[-1] = _safe_float(monthly_net_shortfall[-1] + end_shortfall_net)

    return _ScenarioResult(
        end_value_bruto=current_bruto,
        end_value_netto=current_netto,
        realized_deposits=realized_deposits,
        realized_withdrawals_bruto=realized_withdrawals_bruto,
        realized_withdrawals_netto=realized_withdrawals_netto,
        total_withdrawal_shortfall_netto=_safe_float(total_withdrawal_shortfall_netto),
        has_withdrawal_shortfall=bool(has_withdrawal_shortfall),
        total_costs_paid=_safe_float(total_costs_paid),
        total_management_costs_paid=_safe_float(total_management_costs_paid),
        total_fund_costs_paid=_safe_float(total_fund_costs_paid),
        total_spread_costs_paid=_safe_float(total_spread_costs_paid),
        costs_base_sum=_safe_float(costs_base_sum),
        monthly_values_bruto=monthly_values_bruto,
        monthly_values_netto=monthly_values_netto,
        monthly_net_cashflow=monthly_net_cashflow,
        monthly_cumulative_costs=monthly_cumulative_costs,
        monthly_net_shortfall=monthly_net_shortfall,
    )


def bereken_kosten(inp: RekenInput) -> RekenOutput:
    """Calculate projections under MiFID II compliance."""

    # Initiele kosten schatting puur voor Jaar 1 weergave
    kosten_eur_jaar1 = _safe_float(_bereken_maandkosten(inp.startvermogen) * 12.0)
    kosten_pct_jaar1 = (
        _safe_float((kosten_eur_jaar1 / inp.startvermogen) * 100.0) if inp.startvermogen > 0 else 0.0
    )

    # Assumpties (fallbacks) - Scenario 2 ORTEC data
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

        # Special-case: cashflow exactly at horizon end marker.
        # Apply it at the END of the final simulated month so it is included in end wealth.
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
    scenario_results: list[_ScenarioResult] = []
    for _ in range(inp.n_scenarios):
        scenario_results.append(
            _simulate_single_scenario(
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
        )

    end_values_bruto_arr = np.array([r.end_value_bruto for r in scenario_results], dtype=float)
    end_values_netto_arr = np.array([r.end_value_netto for r in scenario_results], dtype=float)

    profits_bruto_arr = np.array(
        [r.end_value_bruto - r.realized_deposits + r.realized_withdrawals_bruto for r in scenario_results],
        dtype=float,
    )
    profits_netto_arr = np.array(
        [r.end_value_netto - r.realized_deposits + r.realized_withdrawals_netto for r in scenario_results],
        dtype=float,
    )

    monthly_paths_bruto_arr = np.array([r.monthly_values_bruto for r in scenario_results], dtype=float)
    monthly_paths_netto_arr = np.array([r.monthly_values_netto for r in scenario_results], dtype=float)
    monthly_net_cashflow_arr = np.array([r.monthly_net_cashflow for r in scenario_results], dtype=float)
    monthly_net_shortfall_arr = np.array([r.monthly_net_shortfall for r in scenario_results], dtype=float)
    total_costs_paid_arr = np.array([r.total_costs_paid for r in scenario_results], dtype=float)
    total_management_costs_paid_arr = np.array([r.total_management_costs_paid for r in scenario_results], dtype=float)
    total_fund_costs_paid_arr = np.array([r.total_fund_costs_paid for r in scenario_results], dtype=float)
    total_spread_costs_paid_arr = np.array([r.total_spread_costs_paid for r in scenario_results], dtype=float)
    costs_base_sum_arr = np.array([r.costs_base_sum for r in scenario_results], dtype=float)
    monthly_cumulative_costs_arr = np.array([r.monthly_cumulative_costs for r in scenario_results], dtype=float)

    shortfall_arr = np.array([r.total_withdrawal_shortfall_netto for r in scenario_results], dtype=float)
    failed_arr = np.array([1.0 if r.has_withdrawal_shortfall else 0.0 for r in scenario_results], dtype=float)

    # Stats (p50 mediaan conform MiFID II)
    verwacht_eindvermogen_bruto = _safe_stat_percentile(end_values_bruto_arr, 50)
    verwacht_eindvermogen_netto = _safe_stat_percentile(end_values_netto_arr, 50)

    # Percentiles for end values (netto)
    verwacht_eindvermogen_p10_netto = _safe_stat_percentile(end_values_netto_arr, 10)
    verwacht_eindvermogen_p20_netto = _safe_stat_percentile(end_values_netto_arr, 20)
    verwacht_eindvermogen_p40_netto = _safe_stat_percentile(end_values_netto_arr, 40)
    verwacht_eindvermogen_p50_netto = _safe_stat_percentile(end_values_netto_arr, 50)
    verwacht_eindvermogen_p60_netto = _safe_stat_percentile(end_values_netto_arr, 60)
    verwacht_eindvermogen_p80_netto = _safe_stat_percentile(end_values_netto_arr, 80)
    verwacht_eindvermogen_p90_netto = _safe_stat_percentile(end_values_netto_arr, 90)

    verwachte_winst_bruto = _safe_stat_percentile(profits_bruto_arr, 50)
    verwachte_winst_netto = _safe_stat_percentile(profits_netto_arr, 50)

    totale_kosten_betaald = _safe_stat_percentile(total_costs_paid_arr, 50)
    totale_kosten_impact = max(0.0, verwachte_winst_bruto - verwachte_winst_netto)
    misgelopen_rendement_op_kosten = max(0.0, totale_kosten_impact - totale_kosten_betaald)
    totale_beheerkosten_betaald = _safe_stat_percentile(total_management_costs_paid_arr, 50)
    totale_fondskosten_betaald = _safe_stat_percentile(total_fund_costs_paid_arr, 50)
    totale_spreadkosten_betaald = _safe_stat_percentile(total_spread_costs_paid_arr, 50)
    costs_base_sum = _safe_stat_percentile(costs_base_sum_arr, 50)
    
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

    faalkans = float(np.clip(_safe_stat_mean(failed_arr), 0.0, 1.0))
    verwacht_onttrekkingstekort = _safe_stat_mean(shortfall_arr)

    # Timelines
    tijdlijn_vermogen_bruto = [_safe_float(x) for x in np.percentile(monthly_paths_bruto_arr, 50, axis=0)]
    tijdlijn_vermogen_netto = [_safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 50, axis=0)]

    # Percentile timelines for netto vermogen
    tijdlijn_vermogen_p10_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 10, axis=0)
    ]
    tijdlijn_vermogen_p20_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 20, axis=0)
    ]
    tijdlijn_vermogen_p40_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 40, axis=0)
    ]
    tijdlijn_vermogen_p50_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 50, axis=0)
    ]
    tijdlijn_vermogen_p60_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 60, axis=0)
    ]
    tijdlijn_vermogen_p80_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 80, axis=0)
    ]
    tijdlijn_vermogen_p90_netto = [
        _safe_float(x) for x in np.percentile(monthly_paths_netto_arr, 90, axis=0)
    ]
    tijdlijn_cashflow_netto = [_safe_float(x) for x in np.mean(monthly_net_cashflow_arr, axis=0)]
    tijdlijn_kosten_cumulatief = [_safe_float(x) for x in np.mean(monthly_cumulative_costs_arr, axis=0)]
    tijdlijn_tekort = [_safe_float(x) for x in np.mean(monthly_net_shortfall_arr, axis=0)]

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
