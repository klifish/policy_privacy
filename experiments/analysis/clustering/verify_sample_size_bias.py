
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import normalized_mutual_info_score, adjusted_rand_score
import matplotlib.pyplot as plt


def simulate_clustering_bias(n_samples_per_class, n_classes, n_trials=1000):
    k = n_classes
    nmis = []
    aris = []

    for _ in range(n_trials):
        # Scenario: Distributions are perfectly identical (Perfect Privacy)
        # We generate random noise for all samples
        # Labels are fixed (Class 0, Class 1...)

        X = []
        labels = []
        for i in range(n_classes):
            # Generate random data N(0,1) for this class
            # Since distributions are identical, data is just random noise
            # from same distribution
            class_data = np.random.normal(
                loc=0.0, scale=1.0, size=n_samples_per_class)
            X.extend(class_data)
            labels.extend([i] * n_samples_per_class)

        X = np.array(X).reshape(-1, 1)
        labels = np.array(labels)

        # Perform KMeans
        # Note: With identical distributions, any clustering is "spurious"
        if len(X) >= k:
            kmeans = KMeans(n_clusters=k, random_state=None, n_init=10)
            pred_labels = kmeans.fit_predict(X)

            nmi = normalized_mutual_info_score(labels, pred_labels)
            ari = adjusted_rand_score(labels, pred_labels)

            nmis.append(nmi)
            aris.append(ari)

    return np.mean(nmis), np.mean(aris), np.std(nmis), np.std(aris)


print("Starting Simulation of Sample Size Bias...")
print(f"{'Structure':<20} | {'N/Class':<8} | {'Classes':<7} | {'Total N':<7} | {'Mean NMI':<8} | {'Mean ARI':<8} | {'Bias'}")
print("-" * 90)

configs = [
    ("PI (Current)", 3, 2),       # 6 samples total
    ("PI (Better)", 10, 2),
    ("PI (Ideal)", 50, 2),
    ("PI (Big)", 100, 2),

    ("ICD10 (Current)", 3, 5),    # ~15-18 samples total
    ("ICD10 (Better)", 10, 5),
    ("ICD10 (Big)", 100, 5)
]

results = []

for name, n_per_class, n_classes in configs:
    mean_nmi, mean_ari, std_nmi, std_ari = simulate_clustering_bias(
        n_per_class, n_classes)
    total_n = n_per_class * n_classes

    # "True" NMI should be 0 because distributions are identical
    bias_nmi = mean_nmi - 0.0

    print(f"{name:<20} | {n_per_class:<8} | {n_classes:<7} | {total_n:<7} | {mean_nmi:.4f}   | {mean_ari:.4f}   | +{bias_nmi:.4f}")

    results.append({
        "name": name,
        "n_per_class": n_per_class,
        "mean_nmi": mean_nmi
    })

print("\nSimulation Complete.")
print("Note: In this simulation, the ground truth distributions are IDENTICAL.")
print("Any NMI > 0 is purely due to finite sample size bias (overfitting of noise).")
