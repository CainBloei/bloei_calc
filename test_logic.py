import sys
import os
sys.path.insert(0, os.path.abspath('backend'))
from bloei_rekenmodel.domain import RekenInput
from bloei_rekenmodel.logic import bereken_kosten
from datetime import date

try:
    inp = RekenInput(
        startvermogen=100000,
        profiel="Zeer offensief",
        startdatum=date(2026, 3, 2),
        horizon_jaren=15,
        n_scenarios=10, # Keep it small for quick test
    )
    out = bereken_kosten(inp)
    print("SUCCESS, eindvermogen:", out.verwacht_eindvermogen_netto)
except Exception as e:
    import traceback
    traceback.print_exc()
