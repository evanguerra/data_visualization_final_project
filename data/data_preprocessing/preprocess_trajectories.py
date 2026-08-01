"""
Build interpolated concentration trajectories for two molecules that each
have a real 'low' and 'high' rating in the data, for Scene 2 (a D3
animation/scrubber showing how a smell's descriptor profile shifts with
concentration).

Since the source data only has two real measurements (low, high) per
molecule, the in-between steps are *not* real data -- they're a modeled
guess at how the profile might shift smoothly between the two endpoints.
See INTERPOLATION STRATEGY below for exactly how that guess is made.

Inputs:
    behavior_1.csv  - Stimulus x descriptor rating matrix (146 descriptors)
    stimuli.csv     - Stimulus -> CAS / CID / Concentration / Name lookup

Output:
    trajectories.json
"""

import json
import numpy as np
import pandas as pd

BEHAVIOR_PATH = "data/data_preprocessing/behavior_1.csv"
STIMULI_PATH = "data/data_preprocessing/stimuli.csv"
OUTPUT_PATH = "data/trajectories.json"

N_STEPS = 6

EMERGENCE_ABS_THRESHOLD = 1.0
EMERGENCE_DELTA_THRESHOLD = 2.0

behavior = pd.read_csv(BEHAVIOR_PATH)
stimuli = pd.read_csv(STIMULI_PATH)
descriptor_cols = [c for c in behavior.columns if c != "Stimulus"]

merged = behavior.merge(stimuli, on="Stimulus", how="left")

paired_cids = (
    merged.groupby("CID")["Conc"]
    .apply(lambda s: {"high", "low"}.issubset(set(s)))
)
paired_cids = sorted(paired_cids[paired_cids].index.tolist())
print(f"Found {len(paired_cids)} molecules with both a 'high' and 'low' row: {paired_cids}")


import re


def get_pair(cid):
    rows = merged[merged["CID"] == cid]
    low_row = rows[rows["Conc"] == "low"].iloc[0]
    high_row = rows[rows["Conc"] == "high"].iloc[0]
    display_name = re.sub(r"(low|high)conc?$", "", str(low_row["Name"]), flags=re.IGNORECASE)
    return low_row, high_row, display_name, low_row["CAS"]


t_values = np.linspace(0, 1, N_STEPS)


def smoothstep(t):
    return 3 * t**2 - 2 * t**3


def classify_and_interpolate(a, b):
    a, b = float(a), float(b)

    if abs(b - a) < 1e-9:
        return np.full(N_STEPS, a), "flat"

    a_absent = a < EMERGENCE_ABS_THRESHOLD
    b_absent = b < EMERGENCE_ABS_THRESHOLD

    is_emergent = (
        (a_absent and not b_absent and (b - a) >= EMERGENCE_DELTA_THRESHOLD)
        or (b_absent and not a_absent and (a - b) >= EMERGENCE_DELTA_THRESHOLD)
    )

    if is_emergent:
        if a_absent:
            p = t_values
            category = "emergent"
        else:
            p = 1 - t_values
            category = "fading"
        f = p**3
        if a_absent:
            values = a + (b - a) * f
        else:
            values = b + (a - b) * f
        return values, category

    values = a + (b - a) * smoothstep(t_values)
    return values, "grows" if b > a else "shrinks"


def build_molecule(cid):
    low_row, high_row, display_name, cas = get_pair(cid)
    a_vals = low_row[descriptor_cols].astype(float)
    b_vals = high_row[descriptor_cols].astype(float)

    per_descriptor = {}
    counts = {"flat": 0, "emergent": 0, "fading": 0, "grows": 0, "shrinks": 0}
    for desc in descriptor_cols:
        values, category = classify_and_interpolate(a_vals[desc], b_vals[desc])
        per_descriptor[desc] = {
            "category": category,
            "values": [round(float(v), 3) for v in values],
        }
        counts[category] += 1

    steps = []
    for i in range(N_STEPS):
        label = "low" if i == 0 else "high" if i == N_STEPS - 1 else f"step {i + 1}"
        steps.append({
            "step": i + 1,
            "t": round(float(t_values[i]), 3),
            "label": label,
            "values": {desc: per_descriptor[desc]["values"][i] for desc in descriptor_cols},
        })

    most_emergent = sorted(
        (d for d in descriptor_cols if per_descriptor[d]["category"] == "emergent"),
        key=lambda d: per_descriptor[d]["values"][-1],
        reverse=True,
    )[:10]
    most_fading = sorted(
        (d for d in descriptor_cols if per_descriptor[d]["category"] == "fading"),
        key=lambda d: per_descriptor[d]["values"][0],
        reverse=True,
    )[:10]
    biggest_movers = sorted(
        descriptor_cols,
        key=lambda d: abs(per_descriptor[d]["values"][-1] - per_descriptor[d]["values"][0]),
        reverse=True,
    )[:10]

    print(f"  {display_name} (CID {cid}): {counts}")

    return {
        "name": display_name,
        "cas": cas,
        "cid": int(cid),
        "low_stimulus": low_row["Stimulus"],
        "high_stimulus": high_row["Stimulus"],
        "descriptor_categories": {d: per_descriptor[d]["category"] for d in descriptor_cols},
        "steps": steps,
        "highlights": {
            "most_emergent": most_emergent,
            "most_fading": most_fading,
            "biggest_movers": biggest_movers,
        },
    }

molecules = [build_molecule(cid) for cid in paired_cids]

output = {
    "meta": {
        "n_steps": N_STEPS,
    },
    "descriptors": descriptor_cols,
    "molecules": molecules,
}

with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f, indent=2)

print(f"\nWrote {OUTPUT_PATH}")
print(f"  molecules: {len(molecules)}")