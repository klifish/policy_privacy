#!/usr/bin/env python3
"""
构造「平衡」的 PI 配对 (balanced 30v30), 供聚类口径的干净判定使用.

背景: data/polygonAmoy/pi_pairs.json (JS 生成器产物) 里 380/400 对是 (1,1) 样本、
20/400 对是 (1,30) 极端不平衡。KMeans(K=2) 在 1:30 标签下几乎必然切不出真划分,
ARI/NMI 必然≈0 —— 这是 setup 退化, 不是隐私好的证据。

根因: pi_dataset.json 里 1045/1077 策略只有 1 次执行, 仅 32 个策略有 30 次。
本脚本只从这 32 个高执行策略重新两两配对, 每对两边各放该策略全部 30 条执行,
得到真正平衡的 30v30 对, 让 KMeans 不再因不平衡退化。

!! 只写新文件 pi_pairs_balanced.json, 绝不改 pi_pairs.json (有监督 PI 实验在读它)。

pairType 不复刻 JS 的语义相似度 4 分类 (那套在 experiments/ 里, 复刻易偏)。
这里用「结构关系」自定义标签 (报告里会说明, 勿与有监督的四类混淆):
  - same_content              : 同 layer 且同 duoTerm   (结构+内容都最接近)
  - same_structure_diff_content: 同 layer 但 duoTerm 不同 (控制结构, 换内容)
  - cross_structure           : 不同 layer               (结构不同)
"""
import argparse
import json
import itertools
import numpy as np
from collections import defaultdict
from pathlib import Path

DEFAULT_DATA_DIR = Path(__file__).parents[1] / "data"
MIN_EXEC = 30            # 只用执行数 >= 30 的策略 (那 32 个)
MAX_PAIRS_PER_TYPE = 60  # 每类配对采样上限, 避免某结构家族膨胀


def ensure_numeric(value):
    if isinstance(value, str):
        if value.startswith("0x"):
            return int(value, 16)
        return float(value)
    return value


def load_json(path: Path):
    with open(path, "r") as f:
        return json.load(f)


def find_pi_dataset(data_dir: Path) -> Path:
    cands = list(data_dir.glob("**/pi_dataset.json"))
    if not cands:
        raise FileNotFoundError(f"No pi_dataset.json under {data_dir}")
    return cands[0]


def aggregate_policies(dataset):
    """按 policyId 聚合执行, 返回 {policyId: {layer, duoTerm, runs:[features_dict,...]}}."""
    byp = defaultdict(lambda: {"layer": None, "duoTerm": None, "runs": []})
    for e in dataset:
        pid = e.get("policyId")
        feats = e.get("features") or {}
        # 必须有两个 gas 特征才算有效执行
        if feats.get("commitGasUsed") is None or feats.get("accessGasUsed") is None:
            continue
        rec = byp[pid]
        rec["layer"] = e.get("layer")
        rec["duoTerm"] = e.get("duoTerm")
        rec["runs"].append(feats)
    return byp


def pair_type(a, b):
    if a["layer"] == b["layer"]:
        if a["duoTerm"] == b["duoTerm"]:
            return "same_content"
        return "same_structure_diff_content"
    return "cross_structure"


def make_pair(pid_a, pid_b, rec_a, rec_b, idx):
    """组成 analyze_pi_clustering.extract_data_from_pair 期望的结构 (每边 features 是 list)."""
    def policy_block(pid, rec):
        return {
            "name": pid,
            "layer": rec["layer"],
            "duoTerm": rec["duoTerm"],
            # extract_data_from_pair: run 若含 'features' 键则取 run['features'], 否则取 run 本身.
            # 这里直接放 features dict 列表, 每个 dict 自身就是特征 (无嵌套 'features' 键)。
            "features": [dict(r) for r in rec["runs"]],
        }

    return {
        "pairId": f"balanced_{idx}_{pid_a}__{pid_b}",
        "pairType": pair_type(rec_a, rec_b),
        "policies": [policy_block(pid_a, rec_a), policy_block(pid_b, rec_b)],
    }


def build(byp, mode, rng):
    high = {pid: rec for pid, rec in byp.items() if len(rec["runs"]) >= MIN_EXEC}
    pids = sorted(high.keys())

    # 候选 pair 索引 (i<j)
    candidates = []
    for a, b in itertools.combinations(pids, 2):
        same_layer = high[a]["layer"] == high[b]["layer"]
        if mode == "same-layer" and not same_layer:
            continue
        if mode == "cross-layer" and same_layer:
            continue
        candidates.append((a, b))

    # 按 pairType 分桶, 每桶随机采样到上限
    buckets = defaultdict(list)
    for a, b in candidates:
        buckets[pair_type(high[a], high[b])].append((a, b))

    selected = []
    for t in sorted(buckets):
        lst = buckets[t]
        if len(lst) > MAX_PAIRS_PER_TYPE:
            idx = rng.choice(len(lst), size=MAX_PAIRS_PER_TYPE, replace=False)
            lst = [lst[i] for i in sorted(idx)]
        selected.extend(lst)

    pairs = [make_pair(a, b, high[a], high[b], i) for i, (a, b) in enumerate(selected)]
    return high, pairs


def main():
    ap = argparse.ArgumentParser(description="Build balanced 30v30 PI pairs")
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--mode", choices=["same-layer", "cross-layer", "both"], default="both")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--output", type=Path, default=None)
    args = ap.parse_args()

    ds_path = find_pi_dataset(args.data_dir)
    out_path = args.output or (ds_path.parent / "pi_pairs_balanced.json")
    assert out_path.name != "pi_pairs.json", "拒绝覆盖 pi_pairs.json"

    print(f"Loading {ds_path} ...")
    dataset = load_json(ds_path)
    byp = aggregate_policies(dataset)
    n_high = sum(1 for r in byp.values() if len(r["runs"]) >= MIN_EXEC)
    print(f"高执行策略 (>= {MIN_EXEC} 次): {n_high}")

    rng = np.random.default_rng(args.seed)

    if args.mode == "both":
        high_s, pairs_s = build(byp, "same-layer", rng)
        high_c, pairs_c = build(byp, "cross-layer", rng)
        for p in pairs_s:
            p["mode"] = "same-layer"
        for p in pairs_c:
            p["mode"] = "cross-layer"
        pairs = pairs_s + pairs_c
    else:
        _, pairs = build(byp, args.mode, rng)
        for p in pairs:
            p["mode"] = args.mode

    # 统计
    from collections import Counter
    print(f"\n生成 {len(pairs)} 对 (每对两边均 {MIN_EXEC} 样本 → 平衡)")
    print("按 mode:", dict(Counter(p["mode"] for p in pairs)))
    print("按 pairType:", dict(Counter(p["pairType"] for p in pairs)))

    output = {
        "balanced": True,
        "minExec": MIN_EXEC,
        "mode": args.mode,
        "seed": args.seed,
        "note": "structure-relation pairType labels; NOT the supervised semantic/weak/structural/controlled taxonomy",
        "pairs": pairs,
    }
    with open(out_path, "w") as f:
        json.dump(output, f)
    print(f"\nSaved -> {out_path}")


if __name__ == "__main__":
    main()
