"""
Preprocess odor behavioral/molecule data into a single JSON file
ready for a D3 PCA scatter/biplot visualization.

Inputs (edit paths below if needed):
    behavior_1.csv  - Stimulus x descriptor rating matrix (146 descriptors)
    stimuli.csv     - Stimulus -> CAS / CID / Concentration / Name lookup
    molecules.csv   - CID -> MolecularWeight / SMILES / IUPACName / name

Output:
    pca_data.json   - {meta, descriptors, points, loadings}
"""

import json
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BEHAVIOR_PATH = "behavior_1.csv"
STIMULI_PATH = "stimuli.csv"
MOLECULES_PATH = "molecules.csv"
OUTPUT_PATH = "pca_data.json"

N_SCREE_COMPONENTS = 10   # how many PCs to report variance-explained for (scree plot)
N_TOP_LOADINGS = 15       # how many top +/- descriptors per axis to flag as "top_pc1"/"top_pc2"

# ---------------------------------------------------------------------------
# 1. Load
# ---------------------------------------------------------------------------
behavior = pd.read_csv(BEHAVIOR_PATH)
stimuli = pd.read_csv(STIMULI_PATH)
molecules = pd.read_csv(MOLECULES_PATH)

descriptor_cols = [c for c in behavior.columns if c != "Stimulus"]

# ---------------------------------------------------------------------------
# 2. Merge metadata: behavior -> stimuli -> molecules
# ---------------------------------------------------------------------------
meta = stimuli.copy()
meta["CID"] = meta["CID"].astype("Int64")  # nullable int, since ~16 stimuli have no CID
molecules["CID"] = molecules["CID"].astype("Int64")

meta = meta.merge(
    molecules,
    on="CID",
    how="left",
    suffixes=("", "_mol"),
)

merged = behavior.merge(meta, on="Stimulus", how="left")

missing_meta = merged["Name"].isna().sum()
if missing_meta:
    print(f"Warning: {missing_meta} stimuli had no matching row in stimuli.csv")

has_cid = merged["CID"].notna().sum()
print(f"{has_cid}/{len(merged)} stimuli have a linked CID/molecule record "
      f"({len(merged) - has_cid} are mixtures/oils without a single CID)")

# ---------------------------------------------------------------------------
# 3. PCA on the descriptor matrix
# ---------------------------------------------------------------------------
X = merged[descriptor_cols].values

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

n_components = min(N_SCREE_COMPONENTS, X_scaled.shape[0], X_scaled.shape[1])
pca = PCA(n_components=n_components, random_state=0)
scores = pca.fit_transform(X_scaled)

var_ratio = pca.explained_variance_ratio_
cum_var = np.cumsum(var_ratio)

print("Explained variance (PC1..PC{}): {}".format(
    n_components, [round(v * 100, 1) for v in var_ratio]
))

# ---------------------------------------------------------------------------
# 4. Assemble points (one per stimulus)
# ---------------------------------------------------------------------------
def clean(v):
    """Convert numpy/pandas scalars to JSON-friendly python types, NaN -> None."""
    if pd.isna(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return round(float(v), 4)
    return v

points = []
for i, row in merged.iterrows():
    points.append({
        "stimulus": row["Stimulus"],
        "name": clean(row.get("Name")),
        "cas": clean(row.get("CAS")),
        "cid": clean(row.get("CID")),
        "concentration": clean(row.get("Conc")),
        "molecular_weight": clean(row.get("MolecularWeight")),
        "smiles": clean(row.get("IsomericSMILES")),
        "iupac_name": clean(row.get("IUPACName")),
        "molecule_name": clean(row.get("name")),
        "has_molecule_record": bool(pd.notna(row.get("CID"))),
        "pc1": round(float(scores[i, 0]), 4),
        "pc2": round(float(scores[i, 1]), 4),
    })

# ---------------------------------------------------------------------------
# 5. Assemble loadings (one per descriptor) — for a biplot
# ---------------------------------------------------------------------------
# pca.components_ has shape (n_components, n_features); rows = PCs, cols = descriptors
loadings_pc1 = pca.components_[0]
loadings_pc2 = pca.components_[1]

loadings = []
for j, desc in enumerate(descriptor_cols):
    loadings.append({
        "descriptor": desc,
        "pc1": round(float(loadings_pc1[j]), 4),
        "pc2": round(float(loadings_pc2[j]), 4),
    })

top_pc1 = sorted(loadings, key=lambda d: abs(d["pc1"]), reverse=True)[:N_TOP_LOADINGS]
top_pc2 = sorted(loadings, key=lambda d: abs(d["pc2"]), reverse=True)[:N_TOP_LOADINGS]

# ---------------------------------------------------------------------------
# 6. Write output JSON
# ---------------------------------------------------------------------------
output = {
    "meta": {
        "n_stimuli": len(points),
        "n_descriptors": len(descriptor_cols),
        "standardized": True,
        "explained_variance_ratio": [round(float(v), 4) for v in var_ratio],
        "cumulative_variance_ratio": [round(float(v), 4) for v in cum_var],
        "pc1_variance_pct": round(float(var_ratio[0]) * 100, 1),
        "pc2_variance_pct": round(float(var_ratio[1]) * 100, 1),
    },
    "descriptors": descriptor_cols,
    "points": points,
    "loadings": loadings,
    "top_loadings": {
        "pc1": top_pc1,
        "pc2": top_pc2,
    },
}

with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f, indent=2)

print(f"\nWrote {OUTPUT_PATH}")
print(f"  points: {len(points)}")
print(f"  loadings: {len(loadings)}")
print(f"  PC1 variance: {output['meta']['pc1_variance_pct']}%  "
      f"PC2 variance: {output['meta']['pc2_variance_pct']}%")