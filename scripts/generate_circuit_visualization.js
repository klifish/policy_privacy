#!/usr/bin/env node

/**
 * Circuit Visualization Generator with Mermaid
 * 
 * This script generates Mermaid-based visualizations of all circom circuits
 * in the circuits folder, showing component relationships and data flow.
 */

const fs = require('fs');
const path = require('path');
const CircomParser = require('./circom_parser');
const MermaidConverter = require('./mermaid_converter');

class CircuitVisualizer {
    constructor() {
        this.circuitsDir = 'circuits';
        this.outputDir = 'docs/circuit_visualizations';
        this.parser = new CircomParser();
        this.converter = new MermaidConverter();
    }

    async generate() {
        console.log('🎨 Generating Mermaid circuit visualizations...');
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // Find all circom files
        const circuitFiles = this.findCircomFiles(this.circuitsDir);
        console.log(`📁 Found ${circuitFiles.length} circuit files to process`);
        
        const visualizations = [];
        
        // Process each circuit file
        for (const circuitFile of circuitFiles) {
            try {
                console.log(`🔍 Processing: ${circuitFile}`);
                const parsed = this.parser.parseFile(circuitFile);
                const visualization = this.generateVisualizationForCircuit(parsed);
                visualizations.push(visualization);
                
                console.log(`✅ Generated visualization for ${path.basename(circuitFile)}`);
            } catch (error) {
                console.error(`❌ Error processing ${circuitFile}:`, error.message);
            }
        }
        
        // Generate combined HTML file
        const htmlContent = this.generateHtmlViewer(visualizations);
        const htmlPath = path.join(this.outputDir, 'index.html');
        fs.writeFileSync(htmlPath, htmlContent);
        
        console.log(`📄 Generated combined visualization: ${htmlPath}`);
        console.log('🌐 Open the HTML file in a browser to view all circuit visualizations');
        console.log(`✅ Successfully processed ${visualizations.length} circuits`);
        
        return visualizations;
    }

    /**
     * Find all circom files recursively
     * @param {string} dir - Directory to search
     * @returns {Array<string>} Array of file paths
     */
    findCircomFiles(dir) {
        const files = [];
        
        function traverse(currentDir) {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    traverse(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.circom')) {
                    files.push(fullPath);
                }
            }
        }
        
        traverse(dir);
        return files;
    }

    /**
     * Generate visualization for a single circuit
     * @param {object} parsed - Parsed circuit structure
     * @returns {object} Visualization data
     */
    generateVisualizationForCircuit(parsed) {
        const fileName = path.basename(parsed.filePath, '.circom');
        
        // Generate different types of diagrams
        const flowchart = this.converter.convertToFlowchart(parsed);
        const architecture = this.converter.convertToArchitecture(parsed);
        const dataFlow = this.converter.convertToDataFlow(parsed);
        
        return {
            fileName,
            filePath: parsed.filePath,
            circuitInfo: {
                templates: parsed.templates.length,
                components: parsed.components.length,
                signals: parsed.signals.length,
                connections: parsed.connections.length,
                includes: parsed.includes.length
            },
            diagrams: {
                flowchart,
                architecture,
                dataFlow
            },
            parsed
        };
    }

    /**
     * Generate HTML viewer with Mermaid rendering
     * @param {Array<object>} visualizations - Array of visualization data
     * @returns {string} HTML content
     */
    generateHtmlViewer(visualizations) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Circuit Visualizations - Mermaid</title>
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
        
        .circuit-card {
            background: #f8f9fb;
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            border: 1px solid #e1e8ed;
        }
        
        .circuit-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e1e8ed;
        }
        
        .circuit-title {
            font-size: 1.5em;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .circuit-info {
            display: flex;
            gap: 15px;
            font-size: 0.9em;
            color: #7f8c8d;
        }
        
        .info-item {
            background: white;
            padding: 5px 10px;
            border-radius: 15px;
            border: 1px solid #e1e8ed;
        }
        
        .diagram-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .tab-button {
            padding: 10px 20px;
            border: none;
            background: #ecf0f1;
            color: #2c3e50;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        
        .tab-button.active {
            background: #3498db;
            color: white;
        }
        
        .tab-button:hover {
            background: #34495e;
            color: white;
        }
        
        .diagram-content {
            background: white;
            border-radius: 8px;
            padding: 20px;
            border: 1px solid #e1e8ed;
            min-height: 400px;
        }
        
        .diagram-panel {
            display: none;
        }
        
        .diagram-panel.active {
            display: block;
        }
        
        .mermaid-code {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 20px;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.4;
            white-space: pre;
            overflow-x: auto;
            margin-bottom: 15px;
        }
        
        .copy-button {
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            margin-bottom: 10px;
        }
        
        .copy-button:hover {
            background: #2980b9;
        }
        
        .mermaid-note {
            background: #e8f5e8;
            border: 1px solid #2e7d32;
            padding: 15px;
            border-radius: 8px;
            font-size: 14px;
            color: #2e7d32;
        }
        
        .toc {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            max-width: 250px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
        }
        
        .toc h3 {
            margin: 0 0 15px 0;
            color: #2c3e50;
            font-size: 1.1em;
        }
        
        .toc ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .toc li {
            margin: 8px 0;
        }
        
        .toc a {
            color: #3498db;
            text-decoration: none;
            font-size: 0.9em;
            display: block;
            padding: 5px 10px;
            border-radius: 6px;
            transition: background 0.2s;
        }
        
        .toc a:hover {
            background: #ecf0f1;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔮 Circuit Visualizations</h1>
        <div class="subtitle">Interactive Mermaid diagrams for all Circom circuits</div>
        
        <div class="mermaid-note">
            📝 <strong>How to use:</strong> Copy the Mermaid code below and paste it into 
            <a href="https://mermaid.live/" target="_blank">Mermaid Live Editor</a> or any Mermaid-compatible tool to view the interactive diagrams.
        </div>
        
        <div class="toc">
            <h3>📋 Table of Contents</h3>
            <ul>
${visualizations.map(v => `                <li><a href="#${v.fileName}">${v.fileName}</a></li>`).join('\n')}
            </ul>
        </div>
        
${visualizations.map(v => this.generateCircuitCard(v)).join('\n')}
    </div>
    
    <script>
        function copyToClipboard(text, buttonEl) {
            navigator.clipboard.writeText(text).then(function() {
                const originalText = buttonEl.textContent;
                buttonEl.textContent = '✅ Copied!';
                setTimeout(() => {
                    buttonEl.textContent = originalText;
                }, 2000);
            });
        }
        
        function showDiagram(circuitId, diagramType) {
            // Hide all diagram panels for this circuit
            const panels = document.querySelectorAll(\`#\${circuitId} .diagram-panel\`);
            panels.forEach(panel => panel.classList.remove('active'));
            
            // Remove active class from all tabs for this circuit
            const tabs = document.querySelectorAll(\`#\${circuitId} .tab-button\`);
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Show selected diagram panel
            const selectedPanel = document.querySelector(\`#\${circuitId} .diagram-\${diagramType}\`);
            if (selectedPanel) {
                selectedPanel.classList.add('active');
            }
            
            // Add active class to selected tab
            const selectedTab = document.querySelector(\`#\${circuitId} .tab-\${diagramType}\`);
            if (selectedTab) {
                selectedTab.classList.add('active');
            }
        }
        
        // Initialize first tabs as active
        document.querySelectorAll('.circuit-card').forEach(card => {
            const firstTab = card.querySelector('.tab-button');
            const firstPanel = card.querySelector('.diagram-panel');
            if (firstTab && firstPanel) {
                firstTab.classList.add('active');
                firstPanel.classList.add('active');
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate HTML card for a single circuit
     * @param {object} visualization - Visualization data
     * @returns {string} HTML content
     */
    generateCircuitCard(visualization) {
        const { fileName, filePath, circuitInfo, diagrams } = visualization;
        
        return `        <div class="circuit-card" id="${fileName}">
            <div class="circuit-header">
                <div class="circuit-title">📄 ${fileName}.circom</div>
                <div class="circuit-info">
                    <div class="info-item">🏗️ ${circuitInfo.templates} templates</div>
                    <div class="info-item">🧩 ${circuitInfo.components} components</div>
                    <div class="info-item">📡 ${circuitInfo.signals} signals</div>
                    <div class="info-item">🔗 ${circuitInfo.connections} connections</div>
                </div>
            </div>
            
            <div class="diagram-tabs">
                <button class="tab-button tab-flowchart" onclick="showDiagram('${fileName}', 'flowchart')">
                    🌊 Flow Chart
                </button>
                <button class="tab-button tab-architecture" onclick="showDiagram('${fileName}', 'architecture')">
                    🏛️ Architecture
                </button>
                <button class="tab-button tab-dataflow" onclick="showDiagram('${fileName}', 'dataflow')">
                    📊 Data Flow
                </button>
            </div>
            
            <div class="diagram-content">
                <div class="diagram-panel diagram-flowchart">
                    <button class="copy-button" onclick="copyToClipboard(\`${diagrams.flowchart.replace(/`/g, '\\`')}\`, this)">
                        📋 Copy Flowchart Code
                    </button>
                    <div class="mermaid-code">${diagrams.flowchart}</div>
                </div>
                
                <div class="diagram-panel diagram-architecture">
                    <button class="copy-button" onclick="copyToClipboard(\`${diagrams.architecture.replace(/`/g, '\\`')}\`, this)">
                        📋 Copy Architecture Code
                    </button>
                    <div class="mermaid-code">${diagrams.architecture}</div>
                </div>
                
                <div class="diagram-panel diagram-dataflow">
                    <button class="copy-button" onclick="copyToClipboard(\`${diagrams.dataFlow.replace(/`/g, '\\`')}\`, this)">
                        📋 Copy Data Flow Code
                    </button>
                    <div class="mermaid-code">${diagrams.dataFlow}</div>
                </div>
            </div>
        </div>`;
    }
}

// Run visualization generator
if (require.main === module) {
    const visualizer = new CircuitVisualizer();
    visualizer.generate().catch(console.error);
}

module.exports = CircuitVisualizer;