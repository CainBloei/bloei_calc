"""Domain models for the Bloei Rekenmodule calculation engine."""

from datetime import date
from typing import List, Optional, Dict
from pydantic import BaseModel, Field, model_validator


_TOEGESTANE_CASHFLOW_TYPES = {"storting", "onttrekking"}
_TOEGESTANE_PROFIELEN = {
    "Defensief",
    "Matig defensief",
    "Neutraal",
    "Offensief",
    "Zeer offensief",
    "Niet beleggen",
}

# DoS prevention limits
MAX_HORIZON_JAREN = 60
MAX_N_SCENARIOS = 10_000
MAX_EENMALIGE_CASHFLOWS = 500
MAX_MONETARY_EUR = 1e12  # 1 trillion EUR
MAX_CUSTOM_DICT_ENTRIES = 20


class EenmaligeCashflow(BaseModel):
    """Represents a one-time cashflow event.

    Semantics:
    - bedrag is always non-negative.
    - direction is defined by ``type`` only.
    - valid type values are ``storting`` and ``onttrekking``.
    """

    bedrag: float = Field(
        ..., ge=0, le=MAX_MONETARY_EUR,
        description="Cashflow bedrag moet >= 0 en <= 1e12 zijn."
    )
    datum: date
    type: str

    @model_validator(mode="after")
    def validate_type(self) -> 'EenmaligeCashflow':
        if self.type not in _TOEGESTANE_CASHFLOW_TYPES:
            raise ValueError(
                f"EenmaligeCashflow.type moet een van {_TOEGESTANE_CASHFLOW_TYPES} zijn."
            )
        return self


class RekenInput(BaseModel):
    """Input parameters for the projection engine."""

    startvermogen: float = Field(
        ..., ge=0, le=MAX_MONETARY_EUR,
        description="startvermogen moet >= 0 en <= 1e12 zijn."
    )
    profiel: str
    startdatum: date
    horizon_jaren: int = Field(
        ..., ge=0, le=MAX_HORIZON_JAREN,
        description=f"horizon_jaren moet tussen 0 en {MAX_HORIZON_JAREN} zijn."
    )
    n_scenarios: int = Field(
        ..., ge=1, le=MAX_N_SCENARIOS,
        description=f"n_scenarios moet tussen 1 en {MAX_N_SCENARIOS} zijn."
    )
    periodieke_storting_maandelijks: float = Field(
        0.0, ge=0, le=MAX_MONETARY_EUR,
        description="periodieke_storting_maandelijks moet >= 0 zijn."
    )
    periodieke_onttrekking_maandelijks: float = Field(
        0.0, ge=0, le=MAX_MONETARY_EUR,
        description="periodieke_onttrekking_maandelijks moet >= 0 zijn."
    )
    periodieke_storting_startdatum: Optional[date] = None
    periodieke_storting_einddatum: Optional[date] = None
    periodieke_onttrekking_startdatum: Optional[date] = None
    periodieke_onttrekking_einddatum: Optional[date] = None
    eenmalige_cashflows: List[EenmaligeCashflow] = Field(
        default_factory=list, max_length=MAX_EENMALIGE_CASHFLOWS
    )

    afbouw_profiel: bool = False
    is_bloei_plus: bool = False  # standaard Bloei
    rng_seed: int = Field(42, ge=0, le=2**31 - 1)

    custom_rendement_dict: Optional[Dict[str, float]] = None
    custom_volatiliteit_dict: Optional[Dict[str, float]] = None

    @model_validator(mode="after")
    def validate_profiel(self) -> 'RekenInput':
        if self.profiel not in _TOEGESTANE_PROFIELEN:
            raise ValueError(f"profiel moet een van {_TOEGESTANE_PROFIELEN} zijn.")
        return self

    @model_validator(mode="after")
    def validate_custom_dicts(self) -> 'RekenInput':
        """Limit custom dict size and ensure keys are known profiles."""
        for name, d in [
            ("custom_rendement_dict", self.custom_rendement_dict),
            ("custom_volatiliteit_dict", self.custom_volatiliteit_dict),
        ]:
            if d is not None:
                if len(d) > MAX_CUSTOM_DICT_ENTRIES:
                    raise ValueError(f"{name} mag maximaal {MAX_CUSTOM_DICT_ENTRIES} entries bevatten.")
                for k, v in d.items():
                    if k not in _TOEGESTANE_PROFIELEN:
                        raise ValueError(f"{name}: onbekend profiel '{k}'.")
                    if not isinstance(v, (int, float)) or not (-100 <= v <= 1000):
                        raise ValueError(f"{name}: waarde voor '{k}' moet tussen -100 en 1000 zijn.")
        return self


class RekenOutput(BaseModel):
    """Output results from the projection engine.

    Important timing semantics used consistently in engine + UI:
    - ``tijdlijn_datums[m]`` is the month-step marker ``startdatum + m maanden``.
      It marks the end of simulation step m.
    - One-time cashflows are applied at the BEGINNING of a calendar month bucket.
    - Periodic cashflows are applied at the END of each month.
    """

    kosten_eur_jaar1: float
    kosten_pct_jaar1: float
    verwacht_rendement_pct: float
    
    # MiFID II uitsplitsing
    verwacht_eindvermogen_bruto: float
    verwacht_eindvermogen_netto: float
    totale_kosten_betaald: float
    misgelopen_rendement_op_kosten: float
    totale_kosten_impact: float
    totale_beheerkosten_betaald: float
    totale_fondskosten_betaald: float
    totale_spreadkosten_betaald: float
    gemiddelde_beheerkosten_pct: float
    gemiddelde_fondskosten_pct: float
    gemiddelde_spreadkosten_pct: float
    gemiddelde_totale_kosten_pct: float
    
    verwachte_winst_bruto: float
    verwachte_winst_netto: float
    
    # Percentiles for eindvermogen (netto)
    verwacht_eindvermogen_p10_netto: float
    verwacht_eindvermogen_p20_netto: float
    verwacht_eindvermogen_p40_netto: float
    verwacht_eindvermogen_p50_netto: float
    verwacht_eindvermogen_p60_netto: float
    verwacht_eindvermogen_p80_netto: float
    verwacht_eindvermogen_p90_netto: float
    
    # Failure / shortfall metrics
    faalkans: float
    verwacht_onttrekkingstekort: float
    
    tijdlijn_datums: List[date]
    tijdlijn_vermogen_bruto: List[float]
    tijdlijn_vermogen_netto: List[float]
    tijdlijn_vermogen_p10_netto: List[float]
    tijdlijn_vermogen_p20_netto: List[float]
    tijdlijn_vermogen_p40_netto: List[float]
    tijdlijn_vermogen_p50_netto: List[float]
    tijdlijn_vermogen_p60_netto: List[float]
    tijdlijn_vermogen_p80_netto: List[float]
    tijdlijn_vermogen_p90_netto: List[float]
    tijdlijn_profiel: List[str]
    tijdlijn_cashflow_netto: List[float]
    tijdlijn_kosten_cumulatief: List[float]
    tijdlijn_tekort: List[float]
