#!/usr/bin/env node

/**
 * Circuit Visualization Generator with Mermaid Integration
 * 
 * This script analyzes the PolicyPrivacyMain circuit, converts it into Mermaid syntax,
 * and generates an enhanced visualization showing component relationships and data flow.
 */

const fs = require('fs');
const path = require('path');

class CircuitVisualizer {
    constructor() {
        this.circuitPath = 'circuits/policy_privacy_main.circom';
        this.outputPath = 'docs/circuit_visualization.html';
        this.circuitAnalysis = null;
    }

    /**
     * Parse the circom circuit file to extract components and relationships
     */
    analyzeCircuit() {
        if (!fs.existsSync(this.circuitPath)) {
            throw new Error(`Circuit file not found: ${this.circuitPath}`);
        }

        const circuitCode = fs.readFileSync(this.circuitPath, 'utf8');
        
        // Extract circuit structure
        const analysis = {
            inputs: {
                private: [],
                public: []
            },
            outputs: [],
            components: [],
            connections: [],
            constraints: []
        };

        // Parse inputs (signals)
        const privateInputMatches = circuitCode.match(/signal input ([^;]+);/g);
        if (privateInputMatches) {
            privateInputMatches.forEach(match => {
                const inputName = match.match(/signal input ([^;]+);/)[1].split(/[\[\s]/)[0];
                analysis.inputs.private.push(inputName);
            });
        }

        // Parse components
        const componentMatches = circuitCode.match(/component ([^;]+);/g);
        if (componentMatches) {
            componentMatches.forEach(match => {
                const componentName = match.match(/component ([^;]+);/)[1];
                analysis.components.push(componentName);
            });
        }

        // Parse component instantiations
        const instanceMatches = circuitCode.match(/(\w+)\s*=\s*(\w+)\([^)]*\);/g);
        if (instanceMatches) {
            instanceMatches.forEach(match => {
                const [, instanceName, templateName] = match.match(/(\w+)\s*=\s*(\w+)\([^)]*\);/);
                analysis.connections.push({
                    instance: instanceName,
                    template: templateName,
                    type: 'instantiation'
                });
            });
        }

        // Parse outputs
        const outputMatches = circuitCode.match(/signal output ([^;]+);/g);
        if (outputMatches) {
            outputMatches.forEach(match => {
                const outputName = match.match(/signal output ([^;]+);/)[1].split(/[\[\s]/)[0];
                analysis.outputs.push(outputName);
            });
        }

        this.circuitAnalysis = analysis;
        return analysis;
    }

    /**
     * Generate Mermaid flowchart syntax from circuit analysis
     */
    generateMermaidDiagram() {
        if (!this.circuitAnalysis) {
            this.analyzeCircuit();
        }

        const { inputs, outputs, components, connections } = this.circuitAnalysis;

        let mermaidCode = 'flowchart TD\n';
        
        // Input nodes
        mermaidCode += '    %% Private Inputs\n';
        inputs.private.forEach((input, index) => {
            const nodeId = `input_${input}`;
            mermaidCode += `    ${nodeId}["🔒 ${input}"]:::privateInput\n`;
        });

        mermaidCode += '\n    %% Public Inputs\n';
        const publicInputs = [
            'policyCommitment', 'merkleRoots', 'credPublicKeys', 
            'rangeMin', 'rangeMax', 'ontologyPolicyIds', 'ontologyEpochs', 'numOperations'
        ];
        publicInputs.forEach(input => {
            const nodeId = `pub_${input}`;
            mermaidCode += `    ${nodeId}["🌐 ${input}"]:::publicInput\n`;
        });

        // Component nodes
        mermaidCode += '\n    %% Circuit Components\n';
        const mainComponents = [
            { name: 'commitmentVerifier', display: 'Policy Commitment Verifier', template: 'PolicyCommitmentVerifier' },
            { name: 'predicateVerifiers', display: 'External Predicate Verifiers[M]', template: 'ExternalPredicateVerifier' },
            { name: 'policyInterpreter', display: 'Postfix Policy Interpreter', template: 'PostfixPolicyInterpreter' },
            { name: 'finalAnd', display: 'Final AND Gate', template: 'AND' }
        ];

        mainComponents.forEach(comp => {
            const nodeId = `comp_${comp.name}`;
            mermaidCode += `    ${nodeId}["⚙️ ${comp.display}"]:::component\n`;
        });

        // Output node
        mermaidCode += '\n    %% Output\n';
        mermaidCode += '    output_isAuthorized["✅ isAuthorized"]:::output\n';

        // Connections - Data Flow
        mermaidCode += '\n    %% Data Flow Connections\n';
        
        // Private inputs to components
        mermaidCode += '    input_policy --> comp_commitmentVerifier\n';
        mermaidCode += '    input_randomizer --> comp_commitmentVerifier\n';
        mermaidCode += '    input_policy --> comp_policyInterpreter\n';
        mermaidCode += '    input_requesterAttrs --> comp_policyInterpreter\n';
        mermaidCode += '    input_predicateTypes --> comp_predicateVerifiers\n';
        mermaidCode += '    input_merkleLeaves --> comp_predicateVerifiers\n';
        mermaidCode += '    input_merklePathElements --> comp_predicateVerifiers\n';
        mermaidCode += '    input_credMessages --> comp_predicateVerifiers\n';
        mermaidCode += '    input_rangeValues --> comp_predicateVerifiers\n';

        // Public inputs to components
        mermaidCode += '    pub_policyCommitment --> comp_commitmentVerifier\n';
        mermaidCode += '    pub_merkleRoots --> comp_predicateVerifiers\n';
        mermaidCode += '    pub_credPublicKeys --> comp_predicateVerifiers\n';
        mermaidCode += '    pub_rangeMin --> comp_predicateVerifiers\n';
        mermaidCode += '    pub_rangeMax --> comp_predicateVerifiers\n';
        mermaidCode += '    pub_numOperations --> comp_policyInterpreter\n';

        // Component to component connections
        mermaidCode += '    comp_predicateVerifiers -->|predicateValues| comp_policyInterpreter\n';
        mermaidCode += '    comp_commitmentVerifier -->|commitmentValid| comp_finalAnd\n';
        mermaidCode += '    comp_policyInterpreter -->|policyResult| comp_finalAnd\n';
        mermaidCode += '    comp_finalAnd --> output_isAuthorized\n';

        // Styling
        mermaidCode += '\n    %% Styling\n';
        mermaidCode += '    classDef privateInput fill:#e8f5e8,stroke:#27ae60,stroke-width:2px\n';
        mermaidCode += '    classDef publicInput fill:#fff3cd,stroke:#f39c12,stroke-width:2px\n';
        mermaidCode += '    classDef component fill:#e3f2fd,stroke:#3498db,stroke-width:2px\n';
        mermaidCode += '    classDef output fill:#fdeaea,stroke:#e74c3c,stroke-width:2px\n';

        return mermaidCode;
    }

    /**
     * Generate a detailed Mermaid graph showing internal component structure
     */
    generateDetailedMermaidDiagram() {
        let mermaidCode = 'graph TD\n';
        
        mermaidCode += '    %% PolicyPrivacyMain Circuit - Detailed View\n\n';
        
        // Witness structure
        mermaidCode += '    subgraph "Witness Structure w = (P, a, p, r)"\n';
        mermaidCode += '        W1["Policy P: RPN tokens"]:::witness\n';
        mermaidCode += '        W2["Attributes a: requester Boolean values"]:::witness\n';
        mermaidCode += '        W3["Predicates p: external verification results"]:::witness\n';
        mermaidCode += '        W4["Randomizer r: commitment nonce"]:::witness\n';
        mermaidCode += '    end\n\n';

        // Main verification phases
        mermaidCode += '    subgraph "Phase 1: Policy Commitment Verification"\n';
        mermaidCode += '        PC1["Poseidon Hash Policy"]:::crypto\n';
        mermaidCode += '        PC2["Com(P;r) = Poseidon(hash(P), r)"]:::crypto\n';
        mermaidCode += '        PC3["Verify: computed == expected"]:::verify\n';
        mermaidCode += '        PC1 --> PC2 --> PC3\n';
        mermaidCode += '    end\n\n';

        mermaidCode += '    subgraph "Phase 2: External Predicate Verification"\n';
        mermaidCode += '        EV1["Merkle Proof Verification"]:::crypto\n';
        mermaidCode += '        EV2["Credential Signature Verification"]:::crypto\n';
        mermaidCode += '        EV3["Range Proof Verification"]:::crypto\n';
        mermaidCode += '        EV4["Ontology Terms Verification"]:::crypto\n';
        mermaidCode += '        EV5["Generate predicate values p"]:::compute\n';
        mermaidCode += '        EV1 --> EV5\n';
        mermaidCode += '        EV2 --> EV5\n';
        mermaidCode += '        EV3 --> EV5\n';
        mermaidCode += '        EV4 --> EV5\n';
        mermaidCode += '    end\n\n';

        mermaidCode += '    subgraph "Phase 3: Policy Evaluation"\n';
        mermaidCode += '        PE1["Stack-based RPN Interpreter"]:::compute\n';
        mermaidCode += '        PE2["Evaluate C(P,(a,p))"]:::compute\n';
        mermaidCode += '        PE3["Boolean Policy Result"]:::result\n';
        mermaidCode += '        PE1 --> PE2 --> PE3\n';
        mermaidCode += '    end\n\n';

        // Final combination
        mermaidCode += '    FINAL["Final AND Gate"]:::logic\n';
        mermaidCode += '    OUTPUT["isAuthorized ∈ {0,1}"]:::output\n';

        // Connections between phases
        mermaidCode += '    W1 --> PC1\n';
        mermaidCode += '    W4 --> PC2\n';
        mermaidCode += '    W2 --> PE1\n';
        mermaidCode += '    W3 --> EV5\n';
        mermaidCode += '    PC3 --> FINAL\n';
        mermaidCode += '    PE3 --> FINAL\n';
        mermaidCode += '    EV5 --> PE1\n';
        mermaidCode += '    FINAL --> OUTPUT\n';

        // Styling
        mermaidCode += '\n    %% Styling\n';
        mermaidCode += '    classDef witness fill:#fff2e6,stroke:#d35400,stroke-width:2px\n';
        mermaidCode += '    classDef crypto fill:#e8f8f5,stroke:#27ae60,stroke-width:2px\n';
        mermaidCode += '    classDef verify fill:#eef7ff,stroke:#3498db,stroke-width:2px\n';
        mermaidCode += '    classDef compute fill:#f4e6ff,stroke:#9b59b6,stroke-width:2px\n';
        mermaidCode += '    classDef logic fill:#fff0f0,stroke:#e74c3c,stroke-width:2px\n';
        mermaidCode += '    classDef result fill:#f0fff4,stroke:#00c851,stroke-width:2px\n';
        mermaidCode += '    classDef output fill:#fffacd,stroke:#f39c12,stroke-width:3px\n';

        return mermaidCode;
    }

    async generate() {
        console.log('🎨 Generating enhanced circuit visualization with Mermaid...');
        
        try {
            // Analyze circuit
            console.log('📊 Analyzing circuit structure...');
            this.analyzeCircuit();
            
            // Generate Mermaid diagrams
            console.log('🎯 Generating Mermaid diagrams...');
            const flowchartDiagram = this.generateMermaidDiagram();
            const detailedDiagram = this.generateDetailedMermaidDiagram();
            
            // Check if the HTML file exists and update it
            if (fs.existsSync(this.outputPath)) {
                console.log('🔄 Updating existing visualization with Mermaid diagrams...');
                this.updateVisualizationWithMermaid(flowchartDiagram, detailedDiagram);
            } else {
                console.log('🆕 Creating new visualization file...');
                this.createVisualizationWithMermaid(flowchartDiagram, detailedDiagram);
            }
            
            console.log('✅ Circuit visualization enhanced with Mermaid diagrams!');
            console.log(`📄 View: ${this.outputPath}`);
            console.log('🌐 Open the HTML file in a browser to view the interactive circuit visualization');
            
        } catch (error) {
            console.error('❌ Error generating visualization:', error.message);
            throw error;
        }
    }

    /**
     * Update existing HTML file with Mermaid diagrams
     */
    updateVisualizationWithMermaid(flowchartDiagram, detailedDiagram) {
        let htmlContent = fs.readFileSync(this.outputPath, 'utf8');
        
        // Add Mermaid.js script if not already present
        if (!htmlContent.includes('mermaid')) {
            const mermaidScript = `    <script src="assets/mermaid.min.js"></script>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                curve: 'basis',
                padding: 20
            }
        });
    </script>`;
            
            htmlContent = htmlContent.replace('</head>', mermaidScript + '\n</head>');
        }

        // Add Mermaid diagrams section before closing body tag
        const mermaidSection = this.generateMermaidSection(flowchartDiagram, detailedDiagram);
        
        if (!htmlContent.includes('mermaid-diagrams')) {
            htmlContent = htmlContent.replace('</body>', mermaidSection + '\n</body>');
        } else {
            // Replace existing Mermaid section
            const existingSection = htmlContent.match(/<!-- Mermaid Diagrams -->[\s\S]*?<!-- End Mermaid Diagrams -->/);
            if (existingSection) {
                htmlContent = htmlContent.replace(existingSection[0], mermaidSection);
            }
        }

        fs.writeFileSync(this.outputPath, htmlContent);
    }

    /**
     * Create new HTML file with Mermaid diagrams
     */
    createVisualizationWithMermaid(flowchartDiagram, detailedDiagram) {
        const htmlContent = this.generateCompleteHTML(flowchartDiagram, detailedDiagram);
        fs.writeFileSync(this.outputPath, htmlContent);
    }

    /**
     * Generate Mermaid diagrams section HTML
     */
    generateMermaidSection(flowchartDiagram, detailedDiagram) {
        return `        <!-- Mermaid Diagrams -->
        <div id="mermaid-diagrams" class="circuit-flow">
            <h2 style="text-align: center; color: #2c3e50; margin-bottom: 30px;">
                🎯 Interactive Circuit Diagrams
            </h2>
            
            <div style="margin-bottom: 40px;">
                <h3 style="color: #3498db; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                    📊 Circuit Component Flow
                </h3>
                <div class="mermaid" style="text-align: center;">
${flowchartDiagram}
                </div>
            </div>
            
            <div style="margin-bottom: 40px;">
                <h3 style="color: #9b59b6; border-bottom: 2px solid #9b59b6; padding-bottom: 10px;">
                    🔍 Detailed Verification Process
                </h3>
                <div class="mermaid" style="text-align: center;">
${detailedDiagram}
                </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db;">
                <h4 style="color: #3498db; margin-top: 0;">💡 Diagram Legend</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div><span style="color: #27ae60;">🔒</span> Private Inputs (Witness)</div>
                    <div><span style="color: #f39c12;">🌐</span> Public Inputs</div>
                    <div><span style="color: #3498db;">⚙️</span> Circuit Components</div>
                    <div><span style="color: #e74c3c;">✅</span> Outputs</div>
                </div>
            </div>
        </div>
        <!-- End Mermaid Diagrams -->`;
    }

    /**
     * Generate complete HTML file content
     */
    generateCompleteHTML(flowchartDiagram, detailedDiagram) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PolicyPrivacyMain Circuit Visualization with Mermaid</title>
    <script src="assets/mermaid.min.js"></script>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                curve: 'basis',
                padding: 20
            }
        });
    </script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        
        h1 {
            text-align: center;
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 2.5em;
            font-weight: 300;
        }
        
        .subtitle {
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 40px;
            font-size: 1.2em;
            font-style: italic;
        }
        
        .circuit-flow {
            background: #f8f9fb;
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            border: 1px solid #e1e8ed;
        }
        
        .mermaid {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>PolicyPrivacyMain Circuit</h1>
        <div class="subtitle">Zero-Knowledge Privacy-Preserving Consent Management</div>
        
${this.generateMermaidSection(flowchartDiagram, detailedDiagram)}
        
    </div>
</body>
</html>`;
    }
}

// Run visualization generator
if (require.main === module) {
    const visualizer = new CircuitVisualizer();
    visualizer.generate().catch(console.error);
}

module.exports = CircuitVisualizer;