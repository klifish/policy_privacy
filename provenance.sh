python3 - <<'PY'
import json, statistics as st
v = json.load(open("experiments/results/supervised/pch_supervised_verdict.json"))
for t in v["tasks"]:
    if not t["key"].startswith("ICD"):
        continue
    m = max(t["models"], key=lambda k: t["models"][k]["aucMean"])
    md = t["models"][m]
    aucs, pv = md["perSeed"]["auc"], md["perSeed"]["pval"]
    mean, std = sum(aucs) / len(aucs), st.pstdev(aucs)
    gap = sum(abs(a - 0.5) for a in aucs) / len(aucs)
    sig = sum(p < 0.05 for p in pv) / len(pv)
    assert abs(mean - md["aucMean"]) < 1e-12 and abs(std - md["aucStd"]) < 1e-12
    assert abs(gap - md["advantageMean"]) < 1e-12 and sig == md["sigFraction"]
    pos = t["splitDiagnostics"]["classes"]["1"]["medianTestGroups"]
    print(f"{t['key'].split()[1]} {m}  {mean:.3f} ± {std:.3f}  gap {gap:.3f}  sig {sig:.0%}  "
          f"n {t['medianTestN']:.0f} (pos {pos:.0f})  {'PASS' if t['passed'] else 'FAIL'}")
PY
