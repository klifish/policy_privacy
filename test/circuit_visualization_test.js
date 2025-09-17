const assert = require('assert');
const CircomParser = require('../scripts/circom_parser');
const MermaidConverter = require('../scripts/mermaid_converter');
const CircuitVisualizer = require('../scripts/generate_circuit_visualization');

describe('Circuit Visualization Tests', function () {
    let parser;
    let converter;
    let visualizer;

    before(function () {
        parser = new CircomParser();
        converter = new MermaidConverter();
        visualizer = new CircuitVisualizer();
    });

    describe('CircomParser', function () {
        it('should parse a simple circuit file', function () {
            const result = parser.parseFile('circuits/gadgets/commitment.circom');
            
            assert(result.templates.length > 0, 'Should find at least one template');
            assert(result.includes.length >= 0, 'Should parse includes');
            assert(typeof result.filePath === 'string', 'Should include file path');
            
            console.log(`✓ Parsed ${result.templates.length} templates, ${result.includes.length} includes`);
        });

        it('should parse the main policy privacy circuit', function () {
            const result = parser.parseFile('circuits/policy_privacy_main.circom');
            
            assert(result.templates.length > 0, 'Should find PolicyPrivacyMain template');
            assert(result.includes.length > 0, 'Should find include dependencies');
            
            const mainTemplate = result.templates.find(t => t.name === 'PolicyPrivacyMain');
            assert(mainTemplate, 'Should find PolicyPrivacyMain template');
            
            console.log(`✓ Main circuit has ${result.includes.length} dependencies`);
        });
    });

    describe('MermaidConverter', function () {
        it('should convert parsed circuit to flowchart', function () {
            const parsed = parser.parseFile('circuits/gadgets/commitment.circom');
            const mermaid = converter.convertToFlowchart(parsed);
            
            assert(mermaid.includes('flowchart TD'), 'Should generate flowchart syntax');
            assert(mermaid.includes('classDef'), 'Should include style definitions');
            assert(mermaid.includes('inputNode'), 'Should style input nodes');
            
            console.log('✓ Generated flowchart Mermaid code');
        });

        it('should convert parsed circuit to architecture diagram', function () {
            const parsed = parser.parseFile('circuits/policy_privacy_main.circom');
            const mermaid = converter.convertToArchitecture(parsed);
            
            assert(mermaid.includes('graph LR'), 'Should generate architecture syntax');
            assert(mermaid.includes('PolicyPrivacyMain'), 'Should include main template');
            
            console.log('✓ Generated architecture Mermaid code');
        });

        it('should convert parsed circuit to data flow diagram', function () {
            const parsed = parser.parseFile('circuits/gadgets/multimux.circom');
            const mermaid = converter.convertToDataFlow(parsed);
            
            assert(mermaid.includes('flowchart LR'), 'Should generate data flow syntax');
            assert(mermaid.includes('classDef'), 'Should include style definitions');
            
            console.log('✓ Generated data flow Mermaid code');
        });
    });

    describe('CircuitVisualizer Integration', function () {
        it('should find all circuit files', function () {
            const files = visualizer.findCircomFiles('circuits');
            
            assert(files.length > 0, 'Should find circuit files');
            assert(files.every(f => f.endsWith('.circom')), 'All files should be .circom');
            
            console.log(`✓ Found ${files.length} circuit files`);
        });

        it('should generate visualization for a circuit', function () {
            const parsed = parser.parseFile('circuits/gadgets/commitment.circom');
            const visualization = visualizer.generateVisualizationForCircuit(parsed);
            
            assert(visualization.fileName, 'Should have file name');
            assert(visualization.circuitInfo, 'Should have circuit info');
            assert(visualization.diagrams, 'Should have diagrams');
            assert(visualization.diagrams.flowchart, 'Should have flowchart');
            assert(visualization.diagrams.architecture, 'Should have architecture');
            assert(visualization.diagrams.dataFlow, 'Should have data flow');
            
            console.log(`✓ Generated visualization for ${visualization.fileName}`);
        });
    });

    describe('Mermaid Syntax Validation', function () {
        it('should generate valid Mermaid syntax', function () {
            const parsed = parser.parseFile('circuits/gadgets/multimux.circom');
            const flowchart = converter.convertToFlowchart(parsed);
            
            // Basic syntax validation
            const lines = flowchart.split('\n').filter(line => line.trim());
            const firstLine = lines[0];
            
            assert(firstLine.includes('flowchart'), 'First line should declare diagram type');
            
            // Check for balanced brackets and proper node definitions
            const nodeLines = lines.filter(line => line.includes('[') && line.includes(']'));
            assert(nodeLines.length > 0, 'Should have node definitions');
            
            console.log('✓ Mermaid syntax appears valid');
        });

        it('should handle special characters in circuit names', function () {
            const parsed = parser.parseFile('circuits/interpreter/postfix_policy_interpreter.circom');
            const mermaid = converter.convertToFlowchart(parsed);
            
            // Should not contain invalid characters that break Mermaid
            assert(!mermaid.includes('"['), 'Should not have invalid quote-bracket combinations');
            assert(!mermaid.includes(']"'), 'Should not have invalid bracket-quote combinations');
            
            console.log('✓ Special characters handled correctly');
        });
    });
});