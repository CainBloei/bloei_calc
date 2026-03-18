export interface EenmaligeCashflow {
  bedrag: number;
  datum: string; // YYYY-MM-DD
  type: 'storting' | 'onttrekking';
}

export interface RekenInput {
  startvermogen: number;
  profiel: 'Defensief' | 'Matig defensief' | 'Neutraal' | 'Offensief' | 'Zeer offensief' | 'Niet beleggen';
  startdatum: string; // YYYY-MM-DD
  horizon_jaren: number;
  n_scenarios: number;
  periodieke_storting_maandelijks: number;
  periodieke_onttrekking_maandelijks: number;
  periodieke_storting_startdatum?: string;
  periodieke_storting_einddatum?: string;
  periodieke_onttrekking_startdatum?: string;
  periodieke_onttrekking_einddatum?: string;
  eenmalige_cashflows: EenmaligeCashflow[];
  afbouw_profiel: boolean;
  is_bloei_plus: boolean;
  rng_seed: number;
  doelvermogen?: number;
  custom_rendement_dict?: Record<string, number>;
  custom_volatiliteit_dict?: Record<string, number>;
}

export interface RekenOutput {
  kosten_eur_jaar1: number;
  kosten_pct_jaar1: number;
  verwacht_rendement_pct: number;
  
  // MiFID II uitsplitsing
  verwacht_eindvermogen_bruto: number;
  verwacht_eindvermogen_netto: number;
  totale_kosten_betaald: number;
  misgelopen_rendement_op_kosten: number;
  totale_kosten_impact: number;
  totale_beheerkosten_betaald: number;
  totale_fondskosten_betaald: number;
  totale_spreadkosten_betaald: number;
  gemiddelde_beheerkosten_pct: number;
  gemiddelde_fondskosten_pct: number;
  gemiddelde_spreadkosten_pct: number;
  gemiddelde_totale_kosten_pct: number;
  
  verwachte_winst_bruto: number;
  verwachte_winst_netto: number;
  
  verwacht_eindvermogen_p10_netto: number;
  verwacht_eindvermogen_p20_netto: number;
  verwacht_eindvermogen_p40_netto: number;
  verwacht_eindvermogen_p50_netto: number;
  verwacht_eindvermogen_p60_netto: number;
  verwacht_eindvermogen_p80_netto: number;
  verwacht_eindvermogen_p90_netto: number;
  
  faalkans: number;
  verwacht_onttrekkingstekort: number;
  haalbaarheid_doelvermogen_pct?: number;
  
  tijdlijn_datums: string[];
  tijdlijn_vermogen_bruto: number[];
  tijdlijn_vermogen_netto: number[];
  tijdlijn_vermogen_p1_netto: number[];
  tijdlijn_vermogen_p10_netto: number[];
  tijdlijn_vermogen_p20_netto: number[];
  tijdlijn_vermogen_p40_netto: number[];
  tijdlijn_vermogen_p50_netto: number[];
  tijdlijn_vermogen_p60_netto: number[];
  tijdlijn_vermogen_p80_netto: number[];
  tijdlijn_vermogen_p90_netto: number[];
  tijdlijn_vermogen_p99_netto: number[];
  tijdlijn_profiel: string[];
  tijdlijn_cashflow_netto: number[];
  tijdlijn_kosten_cumulatief: number[];
  tijdlijn_tekort?: number[]; // Optioneel: tekort per maand (backend stuurt dit mee)
  verdeling_eindvermogen_percentielen?: number[]; // P1..P99 voor S-curve grafiek
}
