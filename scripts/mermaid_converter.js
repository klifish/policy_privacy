/**
 * Mermaid Converter
 * 
 * Converts parsed circom circuit structure to Mermaid diagram syntax
 */

class MermaidConverter {
    constructor() {
        this.nodeId = 0;
        this.nodeMap = new Map();
        this.edges = [];
        this.subgraphs = new Map();
    }

    /**
     * Convert parsed circuit to Mermaid flowchart
     * @param {object} circuit - Parsed circuit structure
     * @returns {string} Mermaid diagram syntax
     */
    convertToFlowchart(circuit) {
        this.reset();
        
        let mermaid = 'flowchart TD\n';
        
        // Add title
        const fileName = circuit.filePath.split('/').pop() || 'Circuit';
        mermaid += `    %% Circuit: ${fileName}\n\n`;
        
        // Process templates
        circuit.templates.forEach(template => {
            this.processTemplate(template);
        });
        
        // Process main component
        circuit.components.forEach(component => {
            if (component.isMain) {
                this.processMainComponent(component, circuit.templates);
            }
        });
        
        // Add nodes to mermaid
        for (const [nodeKey, nodeInfo] of this.nodeMap) {
            mermaid += `    ${nodeInfo.id}[${nodeInfo.label}]\n`;
            
            // Add styling
            if (nodeInfo.type === 'input') {
                mermaid += `    ${nodeInfo.id}:::inputNode\n`;
            } else if (nodeInfo.type === 'output') {
                mermaid += `    ${nodeInfo.id}:::outputNode\n`;
            } else if (nodeInfo.type === 'component') {
                mermaid += `    ${nodeInfo.id}:::componentNode\n`;
            }
        }
        
        mermaid += '\n';
        
        // Add edges
        this.edges.forEach(edge => {
            mermaid += `    ${edge.from} --> ${edge.to}\n`;
        });
        
        // Add subgraphs (templates)
        for (const [templateName, subgraph] of this.subgraphs) {
            mermaid += `\n    subgraph ${templateName}[Template: ${templateName}]\n`;
            mermaid += subgraph;
            mermaid += '    end\n';
        }
        
        // Add styling
        mermaid += this.getStyleDefinitions();
        
        return mermaid;
    }

    /**
     * Convert to architecture diagram showing component relationships
     * @param {object} circuit - Parsed circuit structure
     * @returns {string} Mermaid diagram syntax
     */
    convertToArchitecture(circuit) {
        this.reset();
        
        let mermaid = 'graph LR\n';
        
        const fileName = circuit.filePath.split('/').pop() || 'Circuit';
        mermaid += `    %% Architecture: ${fileName}\n\n`;
        
        // Create nodes for each template
        circuit.templates.forEach(template => {
            const nodeId = this.getNextNodeId();
            const label = `${template.name}`;
            
            this.nodeMap.set(template.name, {
                id: nodeId,
                label: `"${label}"`,
                type: 'template'
            });
        });
        
        // Find dependencies between templates
        circuit.templates.forEach(template => {
            template.components.forEach(component => {
                const fromTemplate = template.name;
                const toTemplate = component.template;
                
                if (this.nodeMap.has(fromTemplate) && this.nodeMap.has(toTemplate)) {
                    const fromNode = this.nodeMap.get(fromTemplate);
                    const toNode = this.nodeMap.get(toTemplate);
                    
                    this.edges.push({
                        from: fromNode.id,
                        to: toNode.id,
                        label: component.name
                    });
                }
            });
        });
        
        // Add includes as external dependencies
        circuit.includes.forEach(include => {
            const includeNode = this.getNextNodeId();
            const includeName = include.split('/').pop().replace('.circom', '');
            
            this.nodeMap.set(include, {
                id: includeNode,
                label: `"${includeName}"`,
                type: 'include'
            });
        });
        
        // Add nodes
        for (const [nodeKey, nodeInfo] of this.nodeMap) {
            mermaid += `    ${nodeInfo.id}${nodeInfo.label}\n`;
            
            if (nodeInfo.type === 'include') {
                mermaid += `    ${nodeInfo.id}:::includeNode\n`;
            } else if (nodeInfo.type === 'template') {
                mermaid += `    ${nodeInfo.id}:::templateNode\n`;
            }
        }
        
        mermaid += '\n';
        
        // Add edges
        this.edges.forEach(edge => {
            if (edge.label) {
                mermaid += `    ${edge.from} -->|${edge.label}| ${edge.to}\n`;
            } else {
                mermaid += `    ${edge.from} --> ${edge.to}\n`;
            }
        });
        
        mermaid += this.getArchitectureStyleDefinitions();
        
        return mermaid;
    }

    /**
     * Convert to data flow diagram
     * @param {object} circuit - Parsed circuit structure
     * @returns {string} Mermaid diagram syntax
     */
    convertToDataFlow(circuit) {
        this.reset();
        
        let mermaid = 'flowchart LR\n';
        
        const fileName = circuit.filePath.split('/').pop() || 'Circuit';
        mermaid += `    %% Data Flow: ${fileName}\n\n`;
        
        // Find main template
        const mainTemplate = circuit.templates.find(t => 
            circuit.components.some(c => c.isMain && c.template === t.name)
        );
        
        if (mainTemplate) {
            this.processDataFlowTemplate(mainTemplate);
        }
        
        // Add nodes
        for (const [nodeKey, nodeInfo] of this.nodeMap) {
            mermaid += `    ${nodeInfo.id}[${nodeInfo.label}]\n`;
            
            if (nodeInfo.type === 'input') {
                mermaid += `    ${nodeInfo.id}:::inputNode\n`;
            } else if (nodeInfo.type === 'output') {
                mermaid += `    ${nodeInfo.id}:::outputNode\n`;
            } else if (nodeInfo.type === 'component') {
                mermaid += `    ${nodeInfo.id}:::componentNode\n`;
            }
        }
        
        mermaid += '\n';
        
        // Add edges
        this.edges.forEach(edge => {
            mermaid += `    ${edge.from} --> ${edge.to}\n`;
        });
        
        mermaid += this.getStyleDefinitions();
        
        return mermaid;
    }

    /**
     * Process template for data flow diagram
     * @param {object} template - Template definition
     */
    processDataFlowTemplate(template) {
        // Add input signals
        template.signals.filter(s => s.type === 'input').forEach(signal => {
            const nodeId = this.getNextNodeId();
            this.nodeMap.set(`input_${signal.name}`, {
                id: nodeId,
                label: `"Input: ${signal.name}"`,
                type: 'input'
            });
        });
        
        // Add output signals
        template.signals.filter(s => s.type === 'output').forEach(signal => {
            const nodeId = this.getNextNodeId();
            this.nodeMap.set(`output_${signal.name}`, {
                id: nodeId,
                label: `"Output: ${signal.name}"`,
                type: 'output'
            });
        });
        
        // Add component nodes
        template.components.forEach(component => {
            const nodeId = this.getNextNodeId();
            this.nodeMap.set(`component_${component.name}`, {
                id: nodeId,
                label: `"${component.template}"`,
                type: 'component'
            });
        });
        
        // Create flow connections (simplified)
        const inputNodes = Array.from(this.nodeMap.entries())
            .filter(([key, node]) => node.type === 'input');
        const componentNodes = Array.from(this.nodeMap.entries())
            .filter(([key, node]) => node.type === 'component');
        const outputNodes = Array.from(this.nodeMap.entries())
            .filter(([key, node]) => node.type === 'output');
        
        // Connect inputs to components
        inputNodes.forEach(([inputKey, inputNode]) => {
            componentNodes.forEach(([compKey, compNode]) => {
                this.edges.push({
                    from: inputNode.id,
                    to: compNode.id
                });
            });
        });
        
        // Connect components to outputs
        componentNodes.forEach(([compKey, compNode]) => {
            outputNodes.forEach(([outputKey, outputNode]) => {
                this.edges.push({
                    from: compNode.id,
                    to: outputNode.id
                });
            });
        });
    }

    /**
     * Process template for flowchart
     * @param {object} template - Template definition
     */
    processTemplate(template) {
        let subgraphContent = '';
        
        // Add signals to subgraph
        template.signals.forEach(signal => {
            const nodeId = this.getNextNodeId();
            const label = `${signal.name}${signal.isArray ? '[]' : ''}`;
            
            subgraphContent += `        ${nodeId}[${label}]\n`;
            
            if (signal.type === 'input') {
                subgraphContent += `        ${nodeId}:::inputNode\n`;
            } else if (signal.type === 'output') {
                subgraphContent += `        ${nodeId}:::outputNode\n`;
            }
        });
        
        this.subgraphs.set(template.name, subgraphContent);
    }

    /**
     * Process main component
     * @param {object} component - Component definition
     * @param {Array} templates - Available templates
     */
    processMainComponent(component, templates) {
        const template = templates.find(t => t.name === component.template);
        if (!template) return;
        
        const nodeId = this.getNextNodeId();
        this.nodeMap.set('main', {
            id: nodeId,
            label: `"Main: ${component.template}"`,
            type: 'main'
        });
    }

    /**
     * Reset converter state
     */
    reset() {
        this.nodeId = 0;
        this.nodeMap.clear();
        this.edges = [];
        this.subgraphs.clear();
    }

    /**
     * Get next unique node ID
     * @returns {string} Node ID
     */
    getNextNodeId() {
        return `node${this.nodeId++}`;
    }

    /**
     * Get style definitions for flowchart
     * @returns {string} Mermaid style definitions
     */
    getStyleDefinitions() {
        return `
    classDef inputNode fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef outputNode fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef componentNode fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef mainNode fill:#fff3e0,stroke:#e65100,stroke-width:3px
`;
    }

    /**
     * Get style definitions for architecture diagram
     * @returns {string} Mermaid style definitions
     */
    getArchitectureStyleDefinitions() {
        return `
    classDef templateNode fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef includeNode fill:#fff3e0,stroke:#e65100,stroke-width:2px
`;
    }
}

module.exports = MermaidConverter;