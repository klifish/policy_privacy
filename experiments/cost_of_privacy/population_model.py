"""
Requester Population Distribution Model

Models the joint distribution of data requesters over DUO attribute space.
Calibrated with real-world data from GWAS Catalog, NIH RePORTER, dbGaP, etc.

Two complementary models:

1. PRIOR model (population-level):
    D(r) = D_0(r_0) * prod_{i=1}^{5} D_i(r_i)
    Models the overall distribution of requester capabilities.
    Answers: "What fraction of the research community CAN satisfy this policy?"

2. POSTERIOR model (conditional on policy):
    D(r | P) = D(r | requester has seen policy P and attempts access)
    Models requesters who are motivated to access specific data.
    Answers: "Given a requester who WANTS this data, what is P(they can comply)?"

Note on system architecture:
    The ZK circuit (postfix_policy_interpreter.circom) supports AND, OR, NOT logic.
    The current UI (policy.ts compileDuoToTokens) only generates AND policies.
    This model analyzes the full protocol-layer capability space, including OR/NOT,
    to provide a complete theoretical analysis and motivation for extending the UI.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Ontology definitions (mirrored from ui/data/ontologies.ts)
# ---------------------------------------------------------------------------

ICD10_CODES = [
    "C34", "C50", "C61", "C18", "C43", "C91", "C92",  # Neoplasms
    "E11", "E10", "E03", "E05", "E66",                  # Endocrine/Metabolic
    "I10", "I21", "I25", "I50", "I63",                   # Cardiovascular
    "F32", "F41", "F20", "F31", "F84",                   # Mental/Behavioral
    "J45", "J44", "J18",                                  # Respiratory
    "G30", "G20", "G35", "G40",                           # Neurological
    "M05", "M15", "M81",                                  # Musculoskeletal
    "B20", "B18",                                         # Infectious
]

OBI_CODES = [
    "OBI:0000070", "OBI:0001051", "OBI:0002117", "OBI:0001271",
    "OBI:0000615", "OBI:0000916", "OBI:0001985", "OBI:0001318",
    "OBI:0001508", "OBI:0001977", "OBI:0002567", "OBI:0002631",
]

HANCESTRO_CODES = [
    "HANCESTRO:0005", "HANCESTRO:0008", "HANCESTRO:0009", "HANCESTRO:0010",
    "HANCESTRO:0013", "HANCESTRO:0016", "HANCESTRO:0462", "HANCESTRO:0018",
    "HANCESTRO:0014", "HANCESTRO:0020", "HANCESTRO:0004",
]

ISO3166_CODES = [
    "US", "GB", "CA", "AU", "DE", "FR", "JP", "CN", "IN", "BR",
    "KR", "SG", "CH", "NL", "SE", "EU", "EEA", "APAC", "LATAM", "MENA",
]

SNOMED_CODES = [
    "371531000", "308335008", "183452005", "32485007", "183495009",
    "387713003", "103693007", "225358003", "277132007",
    "404684003", "250171008", "118246004", "363679005",
    "185349003", "185353001", "224891009", "182836005",
]

# Attribute metadata
DUO_ATTRIBUTES = [
    {"code": "GR", "index": 0, "namespace": None,       "universe": None},
    {"code": "DS", "index": 1, "namespace": "ICD10",     "universe": ICD10_CODES},
    {"code": "RS", "index": 2, "namespace": "OBI",       "universe": OBI_CODES},
    {"code": "POA","index": 3, "namespace": "HANCESTRO", "universe": HANCESTRO_CODES},
    {"code": "GS", "index": 4, "namespace": "ISO3166",   "universe": ISO3166_CODES},
    {"code": "CC", "index": 5, "namespace": "SNOMED",    "universe": SNOMED_CODES},
]

NUM_ATTRIBUTES = 6
NUM_PREDICATES = 5  # DS, RS, POA, GS, CC (indices 1-5)


# ---------------------------------------------------------------------------
# Real-world calibrated distributions
# ---------------------------------------------------------------------------

def _normalize(weights: Dict[str, float]) -> Dict[str, float]:
    """Normalize weights to sum to 1.0."""
    total = sum(weights.values())
    return {k: v / total for k, v in weights.items()}


def get_real_world_distributions() -> Dict[str, Dict[str, float]]:
    """
    Return calibrated distributions based on real-world data sources.

    Sources:
        ICD10:     NIH RePORTER project categories, Global Burden of Disease 2019
        OBI:       GEO/ArrayExpress submission statistics, GWAS Catalog methods
        HANCESTRO: GWAS Catalog ancestry statistics (Morales et al. 2018, updated 2023)
        ISO3166:   GA4GH Beacon Network node distribution, Nature Index 2023
        SNOMED:    ClinicalTrials.gov intervention type breakdown
    """
    return {
        # ICD-10: calibrated from NIH RePORTER + Global Burden of Disease
        # Cancer dominates research funding; cardiovascular & mental health follow
        "ICD10": _normalize({
            "C34": 0.08, "C50": 0.09, "C61": 0.05, "C18": 0.04, "C43": 0.02,
            "C91": 0.02, "C92": 0.02,                                          # Neoplasms total ~32%
            "E11": 0.06, "E10": 0.03, "E03": 0.01, "E05": 0.01, "E66": 0.04,  # Metabolic ~15%
            "I10": 0.05, "I21": 0.04, "I25": 0.03, "I50": 0.03, "I63": 0.03,  # Cardiovascular ~18%
            "F32": 0.04, "F41": 0.03, "F20": 0.02, "F31": 0.02, "F84": 0.02,  # Mental ~13%
            "J45": 0.02, "J44": 0.02, "J18": 0.01,                             # Respiratory ~5%
            "G30": 0.04, "G20": 0.03, "G35": 0.02, "G40": 0.01,               # Neurological ~10%
            "M05": 0.01, "M15": 0.02, "M81": 0.01,                             # Musculoskeletal ~4%
            "B20": 0.02, "B18": 0.01,                                          # Infectious ~3%
        }),

        # OBI: calibrated from GEO submissions and GWAS Catalog
        # Sequencing-based methods dominate modern genomics research
        "OBI": _normalize({
            "OBI:0000070": 0.08,  # Assay (general)
            "OBI:0001051": 0.12,  # DNA sequencing
            "OBI:0002117": 0.10,  # Whole genome sequencing
            "OBI:0001271": 0.18,  # RNA-seq (most popular in GEO)
            "OBI:0000615": 0.06,  # Protein profiling
            "OBI:0000916": 0.05,  # Flow cytometry
            "OBI:0001985": 0.15,  # GWAS
            "OBI:0001318": 0.08,  # Clinical trial
            "OBI:0001508": 0.04,  # Metabolomics
            "OBI:0001977": 0.05,  # Epigenomics
            "OBI:0002567": 0.06,  # Single cell RNA-seq
            "OBI:0002631": 0.03,  # Spatial transcriptomics
        }),

        # HANCESTRO: calibrated from GWAS Catalog (Morales et al.)
        # European ancestry heavily overrepresented in genomic studies
        "HANCESTRO": _normalize({
            "HANCESTRO:0005": 0.78,   # European
            "HANCESTRO:0008": 0.03,   # African
            "HANCESTRO:0009": 0.10,   # East Asian
            "HANCESTRO:0010": 0.02,   # South Asian
            "HANCESTRO:0013": 0.013,  # Hispanic/Latin American
            "HANCESTRO:0016": 0.002,  # Native American
            "HANCESTRO:0462": 0.01,   # Middle Eastern
            "HANCESTRO:0018": 0.005,  # Oceanian
            "HANCESTRO:0014": 0.015,  # Southeast Asian
            "HANCESTRO:0020": 0.01,   # Sub-Saharan African
            "HANCESTRO:0004": 0.015,  # Admixed ancestry
        }),

        # ISO3166: calibrated from Nature Index 2023 + GA4GH Beacon Network
        # US dominates, followed by EU countries
        "ISO3166": _normalize({
            "US": 0.25, "GB": 0.08, "CA": 0.04, "AU": 0.03, "DE": 0.06,
            "FR": 0.04, "JP": 0.05, "CN": 0.12, "IN": 0.03, "BR": 0.02,
            "KR": 0.03, "SG": 0.02, "CH": 0.02, "NL": 0.03, "SE": 0.02,
            "EU": 0.08, "EEA": 0.03, "APAC": 0.03, "LATAM": 0.01, "MENA": 0.01,
        }),

        # SNOMED: calibrated from ClinicalTrials.gov intervention types
        "SNOMED": _normalize({
            "371531000": 0.08,  # Report
            "308335008": 0.10,  # Encounter
            "183452005": 0.04,  # Emergency admission
            "32485007":  0.06,  # Hospital admission
            "183495009": 0.04,  # Non-urgent admission
            "387713003": 0.10,  # Surgical procedure
            "103693007": 0.12,  # Diagnostic procedure
            "225358003": 0.08,  # Screening
            "277132007": 0.10,  # Therapeutic
            "404684003": 0.06,  # Clinical finding
            "250171008": 0.04,  # History
            "118246004": 0.06,  # Lab test
            "363679005": 0.04,  # Imaging
            "185349003": 0.04,  # Primary care
            "185353001": 0.02,  # Secondary care
            "224891009": 0.01,  # Palliative
            "182836005": 0.01,  # Preventive
        }),
    }


def get_uniform_distributions() -> Dict[str, Dict[str, float]]:
    """Uniform distributions for baseline comparison."""
    result = {}
    for attr in DUO_ATTRIBUTES[1:]:  # Skip GR
        codes = attr["universe"]
        n = len(codes)
        result[attr["namespace"]] = {code: 1.0 / n for code in codes}
    return result


# ---------------------------------------------------------------------------
# Population scenario presets
# ---------------------------------------------------------------------------

@dataclass
class PopulationScenario:
    """A named population distribution scenario."""
    name: str
    description: str
    p_gr: float  # Probability of general research attribute
    # Probability of each predicate attribute being claimed
    p_claim: Dict[str, float]  # namespace -> probability of claiming this attribute
    distributions: Dict[str, Dict[str, float]]  # namespace -> code -> probability


def get_scenario_presets() -> Dict[str, PopulationScenario]:
    """Return 5 population scenarios for sensitivity analysis."""
    real = get_real_world_distributions()
    uniform = get_uniform_distributions()

    return {
        "uniform": PopulationScenario(
            name="Uniform",
            description="All ontology codes equally likely; baseline reference",
            p_gr=0.5,
            p_claim={"ICD10": 0.5, "OBI": 0.5, "HANCESTRO": 0.5, "ISO3166": 0.5, "SNOMED": 0.5},
            distributions=uniform,
        ),
        "real_world": PopulationScenario(
            name="Real-World Calibrated",
            description="Calibrated from GWAS Catalog, NIH RePORTER, GEO, Nature Index",
            p_gr=0.6,
            p_claim={"ICD10": 0.4, "OBI": 0.7, "HANCESTRO": 0.3, "ISO3166": 0.8, "SNOMED": 0.2},
            distributions=real,
        ),
        "us_centric": PopulationScenario(
            name="US-Centric",
            description="US-dominated geographic distribution; typical of NIH-funded studies",
            p_gr=0.7,
            p_claim={"ICD10": 0.4, "OBI": 0.7, "HANCESTRO": 0.3, "ISO3166": 0.9, "SNOMED": 0.2},
            distributions={
                **real,
                "ISO3166": _normalize({
                    "US": 0.55, "GB": 0.05, "CA": 0.05, "AU": 0.02, "DE": 0.03,
                    "FR": 0.02, "JP": 0.02, "CN": 0.03, "IN": 0.02, "BR": 0.01,
                    "KR": 0.01, "SG": 0.01, "CH": 0.01, "NL": 0.01, "SE": 0.01,
                    "EU": 0.06, "EEA": 0.03, "APAC": 0.02, "LATAM": 0.02, "MENA": 0.01,
                }),
            },
        ),
        "cancer_focused": PopulationScenario(
            name="Cancer-Focused",
            description="High proportion of cancer researchers; heavy neoplasm codes",
            p_gr=0.5,
            p_claim={"ICD10": 0.7, "OBI": 0.6, "HANCESTRO": 0.3, "ISO3166": 0.6, "SNOMED": 0.3},
            distributions={
                **real,
                "ICD10": _normalize({
                    "C34": 0.15, "C50": 0.18, "C61": 0.10, "C18": 0.08, "C43": 0.05,
                    "C91": 0.04, "C92": 0.04,
                    "E11": 0.03, "E10": 0.01, "E03": 0.005, "E05": 0.005, "E66": 0.02,
                    "I10": 0.02, "I21": 0.02, "I25": 0.01, "I50": 0.01, "I63": 0.01,
                    "F32": 0.02, "F41": 0.01, "F20": 0.01, "F31": 0.01, "F84": 0.01,
                    "J45": 0.01, "J44": 0.01, "J18": 0.005,
                    "G30": 0.02, "G20": 0.01, "G35": 0.01, "G40": 0.005,
                    "M05": 0.005, "M15": 0.01, "M81": 0.005,
                    "B20": 0.01, "B18": 0.005,
                }),
            },
        ),
        "european_ancestry": PopulationScenario(
            name="European Ancestry Heavy",
            description="Exaggerated European ancestry bias; represents current GWAS landscape",
            p_gr=0.6,
            p_claim={"ICD10": 0.4, "OBI": 0.7, "HANCESTRO": 0.5, "ISO3166": 0.7, "SNOMED": 0.2},
            distributions={
                **real,
                "HANCESTRO": _normalize({
                    "HANCESTRO:0005": 0.88,
                    "HANCESTRO:0008": 0.02,
                    "HANCESTRO:0009": 0.05,
                    "HANCESTRO:0010": 0.01,
                    "HANCESTRO:0013": 0.01,
                    "HANCESTRO:0016": 0.001,
                    "HANCESTRO:0462": 0.005,
                    "HANCESTRO:0018": 0.002,
                    "HANCESTRO:0014": 0.005,
                    "HANCESTRO:0020": 0.005,
                    "HANCESTRO:0004": 0.007,
                }),
            },
        ),
    }


# ---------------------------------------------------------------------------
# Population sampler
# ---------------------------------------------------------------------------

class RequesterPopulation:
    """
    Samples requester profiles from a given population scenario.

    A requester profile R = (r_0, r_1, ..., r_5) where:
        r_0 in {0, 1}: general research flag
        r_i in S_i: ontology code for attribute i (i >= 1)
    """

    def __init__(self, scenario: PopulationScenario, rng: Optional[np.random.Generator] = None):
        self.scenario = scenario
        self.rng = rng or np.random.default_rng(42)

        # Pre-compute code arrays and probability arrays per namespace
        self._code_arrays: Dict[str, np.ndarray] = {}
        self._prob_arrays: Dict[str, np.ndarray] = {}
        for attr in DUO_ATTRIBUTES[1:]:
            ns = attr["namespace"]
            codes = attr["universe"]
            dist = scenario.distributions[ns]
            self._code_arrays[ns] = np.array(codes)
            self._prob_arrays[ns] = np.array([dist.get(c, 0.0) for c in codes])

    def sample(self, n: int) -> List[Dict]:
        """Sample n requester profiles."""
        profiles = []
        for _ in range(n):
            profile = {"attrs": [0] * NUM_ATTRIBUTES, "codes": [None] * NUM_ATTRIBUTES}

            # GR attribute
            if self.rng.random() < self.scenario.p_gr:
                profile["attrs"][0] = 1

            # Predicate attributes (indices 1-5)
            for attr in DUO_ATTRIBUTES[1:]:
                idx = attr["index"]
                ns = attr["namespace"]
                p_claim = self.scenario.p_claim[ns]

                if self.rng.random() < p_claim:
                    profile["attrs"][idx] = 1
                    # Sample a specific ontology code
                    code_idx = self.rng.choice(
                        len(self._code_arrays[ns]),
                        p=self._prob_arrays[ns]
                    )
                    profile["codes"][idx] = self._code_arrays[ns][code_idx]

            profiles.append(profile)
        return profiles

    def attribute_satisfaction_probability(self, attr_index: int,
                                           whitelist: Optional[List[str]] = None) -> float:
        """
        Compute P(requester satisfies attribute a_i | whitelist W_i).

        For GR (index 0): P = p_gr (no predicate)
        For predicate attrs: P = p_claim_i * sum_{c in W_i} D_i(c)
        """
        if attr_index == 0:
            return self.scenario.p_gr

        attr = DUO_ATTRIBUTES[attr_index]
        ns = attr["namespace"]
        p_claim = self.scenario.p_claim[ns]

        if whitelist is None:
            # Full whitelist: all codes allowed
            return p_claim

        dist = self.scenario.distributions[ns]
        p_match = sum(dist.get(c, 0.0) for c in whitelist)
        return p_claim * p_match

    def predicate_match_probability(self, attr_index: int,
                                     whitelist: List[str]) -> float:
        """
        Compute P(requester's code is in whitelist | requester claims this attribute).

        This is the conditional probability: P(r_i in W_i | attr_i = 1).
        """
        if attr_index == 0:
            return 1.0  # GR always matches (no predicate)

        attr = DUO_ATTRIBUTES[attr_index]
        ns = attr["namespace"]
        dist = self.scenario.distributions[ns]
        return sum(dist.get(c, 0.0) for c in whitelist)


# ---------------------------------------------------------------------------
# Posterior (conditional) model
# ---------------------------------------------------------------------------

class ConditionalRequesterModel:
    """
    Models requester behavior AFTER seeing a specific policy.

    In the real system flow:
        1. Provider publishes policy P (encrypted)
        2. Requester requests and decrypts the policy
        3. Requester sees which attributes and codes are required
        4. Requester attempts to provide evidence IF they have matching credentials

    The posterior model captures:
        P(satisfy | policy P, requester has credential set C)

    Key difference from prior model:
        - Prior: requester randomly sampled from population, may or may not try
        - Posterior: requester is MOTIVATED to access, will try if they CAN

    This changes the probability structure:
        Prior:     p_i = p_claim × p_match    (may not even try)
        Posterior: p_i = p_has_credential × p_match  (always tries if they can)

    where p_has_credential >= p_claim because motivated requesters are more
    likely to have relevant credentials.
    """

    def __init__(self, base_population: RequesterPopulation,
                 motivation_boost: float = 1.5):
        """
        Args:
            base_population: underlying population distribution
            motivation_boost: multiplier on p_claim for motivated requesters
                              (capped at 1.0). Reflects selection bias:
                              requesters who seek specific data are more likely
                              to work in that domain.
        """
        self.base = base_population
        self.boost = motivation_boost

    def conditional_satisfaction_probability(
        self, attr_index: int, whitelist: Optional[List[str]] = None
    ) -> float:
        """
        P(requester satisfies attribute a_i | requester wants to access data
          governed by a policy that includes a_i).

        The key insight: a requester who seeks disease-specific data is more
        likely to be a disease researcher (higher p_claim for DS) than a
        random member of the general population.
        """
        if attr_index == 0:
            # GR: motivated requesters almost always claim general research
            return min(self.base.scenario.p_gr * self.boost, 1.0)

        attr = DUO_ATTRIBUTES[attr_index]
        ns = attr["namespace"]

        # Boosted claim probability (selection bias)
        p_claim_boosted = min(
            self.base.scenario.p_claim[ns] * self.boost, 1.0
        )

        if whitelist is None:
            return p_claim_boosted

        # Code distribution conditional on having the credential
        dist = self.base.scenario.distributions[ns]
        p_match = sum(dist.get(c, 0.0) for c in whitelist)

        return p_claim_boosted * p_match

    def prior_vs_posterior_comparison(
        self, attr_index: int, whitelist: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """Compare prior and posterior satisfaction probabilities."""
        p_prior = self.base.attribute_satisfaction_probability(attr_index, whitelist)
        p_posterior = self.conditional_satisfaction_probability(attr_index, whitelist)

        return {
            "prior": p_prior,
            "posterior": p_posterior,
            "ratio": p_posterior / p_prior if p_prior > 0 else float("inf"),
            "attr": DUO_ATTRIBUTES[attr_index]["code"],
        }
