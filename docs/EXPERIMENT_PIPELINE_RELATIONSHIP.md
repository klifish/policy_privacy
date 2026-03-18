# Experiment Pipeline Relationship

This diagram summarizes how the unified pipeline, the three JavaScript experiment modules, and the Python analysis layer relate to each other.

```mermaid
flowchart LR
    subgraph SharedCore["Shared JS foundations"]
        direction TB
        DG["policy_content_hiding/data_generator.js<br/>base dataset generation and execution"]
        SPPMeta["structure_and_parameter_privacy/data_generator.js<br/>SPP annotation and balance metadata"]
    end

    subgraph Unified["Unified entry"]
        direction TB
        U["experiments/unified/run.js<br/>validate, annotate, execute once"]
    end

    subgraph Artifacts["Shared dataset artifacts"]
        direction TB
        Defs["policy_definitions.json"]
        Exec["executed_dataset.json"]
        PCH["pch_dataset.json"]
        SPP["spp_dataset.json"]
        PI["pi_dataset.json"]
    end

    subgraph Pairing["PI pair construction"]
        direction TB
        PIPairBuilder["policy_indistinguishability/pi_data_generator.js<br/>build pairs from executed PI data"]
        Pairs["pi_pairs.json"]
    end

    subgraph PythonLayer["Current data analysis"]
        direction TB
        PyRunner["python/run_policy_privacy_experiments.py<br/>aggregate, repeat, visualize, report"]
        PyOutput["python/policy_privacy_report.json<br/>plots and aggregated metrics"]
    end

    subgraph JSExperiments["Legacy JS analysis runners"]
        direction TB
        PCHRunner["policy_content_hiding/run_experiment.js<br/>legacy PCH analysis path"]
        SPPRunner["structure_and_parameter_privacy/run_experiment.js<br/>legacy SPP analysis path"]
        PIRunner["policy_indistinguishability/run_experiment.js<br/>legacy PI analysis path"]
    end

    DG --> U
    SPPMeta --> U

    U --> Defs
    U --> Exec
    U --> PCH
    U --> SPP
    U --> PI

    PI --> PIPairBuilder
    Exec --> PIPairBuilder
    PIPairBuilder --> Pairs

    PCH --> PyRunner
    SPP --> PyRunner
    Pairs --> PyRunner
    PyRunner --> PyOutput

    Defs --> PCHRunner
    PCH --> PCHRunner

    Defs --> SPPRunner
    SPP --> SPPRunner

    Defs --> PIRunner
    Pairs --> PIRunner

    style SharedCore fill:#eefbea,stroke:#4f8a3e,stroke-width:2px
    style Unified fill:#e5f7de,stroke:#4f8a3e,stroke-width:2px
    style Artifacts fill:#f1faec,stroke:#4f8a3e,stroke-width:2px
    style Pairing fill:#edf8ee,stroke:#4f8a3e,stroke-width:2px
    style JSExperiments fill:#fdecec,stroke:#b54343,stroke-width:2px
    style PythonLayer fill:#eaf8f0,stroke:#4f8a3e,stroke-width:2px

    classDef core fill:#dff4d8,stroke:#4f8a3e,color:#183116,stroke-width:1.5px
    classDef unified fill:#d8f0cf,stroke:#4f8a3e,color:#183116,stroke-width:1.5px
    classDef artifact fill:#e8f6e1,stroke:#4f8a3e,color:#183116,stroke-width:1.5px
    classDef pairing fill:#e2f2e4,stroke:#4f8a3e,color:#183116,stroke-width:1.5px
    classDef legacy fill:#f9d6d6,stroke:#b54343,color:#4a1212,stroke-width:1.5px
    classDef python fill:#def3e7,stroke:#4f8a3e,color:#183116,stroke-width:1.5px

    class DG,SPPMeta core
    class U unified
    class Defs,Exec,PCH,SPP,PI artifact
    class PIPairBuilder,Pairs pairing
    class PCHRunner,SPPRunner,PIRunner legacy
    class PyRunner,PyOutput python
```

## Reading the diagram

- The unified pipeline is the main data-preparation entry point. It generates one shared dataset, validates it, executes it on-chain once, and writes experiment-specific artifact files.
- The PCH, SPP, and PI directories still contain experiment-specific attack and evaluation logic, but the JavaScript analysis runners shown above are now legacy paths rather than the main workflow.
- The main path is now easier to read from left to right: shared JS foundations, unified generation, shared artifacts, PI pair construction, and Python analysis.
- The Python layer consumes shared dataset artifacts and PI pairs to run repeated offline analysis, plotting, and final report aggregation.
- PI is slightly different from PCH and SPP because it inserts an explicit pair-construction stage before either legacy JS analysis or Python analysis.
