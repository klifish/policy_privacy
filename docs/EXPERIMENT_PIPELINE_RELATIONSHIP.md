# Experiment Pipeline Relationship

This diagram summarizes how the unified pipeline, the three JavaScript experiment modules, and the Python analysis layer relate to each other.

```mermaid
flowchart TD
    subgraph SharedCore["Shared JS foundations"]
        DG["policy_content_hiding/data_generator.js<br/>base dataset generation and execution"]
        SPPMeta["structure_and_parameter_privacy/data_generator.js<br/>SPP annotation and balance metadata"]
        PIPairBuilder["policy_indistinguishability/pi_data_generator.js<br/>PI pair construction"]
    end

    subgraph Unified["Unified entry"]
        U["experiments/unified/run.js<br/>validate, annotate, execute once"]
    end

    subgraph Artifacts["Shared dataset artifacts"]
        Defs["policy_definitions.json"]
        Exec["executed_dataset.json"]
        PCH["pch_dataset.json"]
        SPP["spp_dataset.json"]
        PI["pi_dataset.json"]
        Pairs["pi_pairs.json"]
    end

    subgraph JSExperiments["Experiment-specific JS runners"]
        PCHRunner["policy_content_hiding/run_experiment.js<br/>PCH phase 2 and 3"]
        SPPRunner["structure_and_parameter_privacy/run_experiment.js<br/>SPP phase 2 and 3"]
        PIRunner["policy_indistinguishability/run_experiment.js<br/>PI phase 2 and 3"]
    end

    subgraph PythonLayer["Offline Python analysis"]
        PyRunner["python/run_policy_privacy_experiments.py<br/>aggregate, repeat, visualize, report"]
        PyOutput["python/policy_privacy_report.json<br/>plots and aggregated metrics"]
    end

    DG --> U
    SPPMeta --> U

    U --> Defs
    U --> Exec
    U --> PCH
    U --> SPP
    U --> PI

    Defs --> PCHRunner
    PCH --> PCHRunner

    Defs --> SPPRunner
    SPP --> SPPRunner

    Defs --> PIRunner
    PI --> PIPairBuilder
    Exec --> PIPairBuilder
    PIPairBuilder --> Pairs
    Pairs --> PIRunner

    PCH --> PyRunner
    SPP --> PyRunner
    Pairs --> PyRunner
    PyRunner --> PyOutput
```

## Reading the diagram

- The unified pipeline is the main data-preparation entry point. It generates one shared dataset, validates it, executes it on-chain once, and writes experiment-specific artifact files.
- The PCH, SPP, and PI directories still matter after that step because each one contains the attack and evaluation logic for its own experiment.
- The Python layer sits after the JavaScript pipelines. It consumes dataset artifacts and PI pairs to run repeated offline analysis, plotting, and final report aggregation.
- PI is slightly different from PCH and SPP because it needs an extra pair-construction step before attack analysis.