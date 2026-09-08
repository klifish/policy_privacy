/**
 * Circom Circuit Parser
 * 
 * Parses circom circuit files to extract components, templates, signals, and connections
 * for Mermaid diagram generation.
 */

const fs = require('fs');
const path = require('path');

class CircomParser {
    constructor() {
        this.templateDefinitions = new Map();
        this.componentInstances = new Map();
        this.signals = new Map();
        this.connections = [];
        this.includes = [];
    }

    /**
     * Parse a circom file and extract circuit structure
     * @param {string} filePath - Path to the circom file
     * @returns {object} Parsed circuit structure
     */
    parseFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        return this.parseContent(content, filePath);
    }

    /**
     * Parse circom content string
     * @param {string} content - Circom file content
     * @param {string} filePath - File path for context
     * @returns {object} Parsed circuit structure
     */
    parseContent(content, filePath = 'unknown') {
        this.reset();
        
        // Remove comments
        const cleanContent = this.removeComments(content);
        
        // Parse includes
        this.parseIncludes(cleanContent);
        
        // Parse template definitions
        this.parseTemplates(cleanContent);
        
        // Parse component instances and signals
        this.parseComponents(cleanContent);
        
        // Parse signal connections
        this.parseConnections(cleanContent);
        
        return {
            filePath,
            templates: Array.from(this.templateDefinitions.entries()).map(([name, def]) => ({ name, ...def })),
            components: Array.from(this.componentInstances.entries()).map(([name, inst]) => ({ name, ...inst })),
            signals: Array.from(this.signals.entries()).map(([name, sig]) => ({ name, ...sig })),
            connections: this.connections,
            includes: this.includes
        };
    }

    /**
     * Reset parser state
     */
    reset() {
        this.templateDefinitions.clear();
        this.componentInstances.clear();
        this.signals.clear();
        this.connections = [];
        this.includes = [];
    }

    /**
     * Remove comments from circom content
     * @param {string} content - Raw content
     * @returns {string} Content without comments
     */
    removeComments(content) {
        // Remove single-line comments
        content = content.replace(/\/\/.*$/gm, '');
        
        // Remove multi-line comments
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
        
        return content;
    }

    /**
     * Parse include statements
     * @param {string} content - Clean content
     */
    parseIncludes(content) {
        const includeRegex = /include\s+"([^"]+)"/g;
        let match;
        
        while ((match = includeRegex.exec(content)) !== null) {
            this.includes.push(match[1]);
        }
    }

    /**
     * Parse template definitions
     * @param {string} content - Clean content
     */
    parseTemplates(content) {
        const templateRegex = /template\s+(\w+)\s*\(([^)]*)\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
        let match;
        
        while ((match = templateRegex.exec(content)) !== null) {
            const name = match[1];
            const params = this.parseParameters(match[2]);
            const body = match[3];
            
            const signals = this.parseTemplateSignals(body);
            const components = this.parseTemplateComponents(body);
            
            this.templateDefinitions.set(name, {
                parameters: params,
                signals,
                components,
                body
            });
        }
    }

    /**
     * Parse template parameters
     * @param {string} paramStr - Parameter string
     * @returns {Array} Array of parameter names
     */
    parseParameters(paramStr) {
        if (!paramStr.trim()) return [];
        
        return paramStr.split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }

    /**
     * Parse signals within a template
     * @param {string} body - Template body
     * @returns {Array} Array of signal definitions
     */
    parseTemplateSignals(body) {
        const signals = [];
        const signalRegex = /signal\s+(input|output|private)?\s*([^;]+);/g;
        let match;
        
        while ((match = signalRegex.exec(body)) !== null) {
            const type = match[1] || 'private';
            const declaration = match[2].trim();
            
            // Parse signal names and arrays
            const signalNames = this.parseSignalDeclaration(declaration);
            
            signalNames.forEach(signal => {
                signals.push({
                    name: signal.name,
                    type,
                    isArray: signal.isArray,
                    dimensions: signal.dimensions
                });
            });
        }
        
        return signals;
    }

    /**
     * Parse signal declaration (handles arrays)
     * @param {string} declaration - Signal declaration
     * @returns {Array} Array of signal info
     */
    parseSignalDeclaration(declaration) {
        const signals = [];
        const parts = declaration.split(',');
        
        parts.forEach(part => {
            part = part.trim();
            const arrayMatch = part.match(/(\w+)(\[.*\])?/);
            
            if (arrayMatch) {
                const name = arrayMatch[1];
                const dimensions = arrayMatch[2] ? 
                    arrayMatch[2].match(/\[([^\]]+)\]/g)?.map(d => d.slice(1, -1)) || [] : [];
                
                signals.push({
                    name,
                    isArray: dimensions.length > 0,
                    dimensions
                });
            }
        });
        
        return signals;
    }

    /**
     * Parse components within a template
     * @param {string} body - Template body
     * @returns {Array} Array of component definitions
     */
    parseTemplateComponents(body) {
        const components = [];
        const componentRegex = /component\s+(\w+)(?:\[.*?\])?\s*=\s*(\w+)\s*\(([^)]*)\)/g;
        let match;
        
        while ((match = componentRegex.exec(body)) !== null) {
            const name = match[1];
            const template = match[2];
            const params = match[3] ? match[3].split(',').map(p => p.trim()) : [];
            
            components.push({
                name,
                template,
                parameters: params
            });
        }
        
        return components;
    }

    /**
     * Parse component instances in main scope
     * @param {string} content - Clean content
     */
    parseComponents(content) {
        const componentRegex = /component\s+main\s*(?:\{[^}]*\})?\s*=\s*(\w+)\s*\(([^)]*)\)/g;
        let match;
        
        while ((match = componentRegex.exec(content)) !== null) {
            const template = match[1];
            const params = match[2] ? match[2].split(',').map(p => p.trim()) : [];
            
            this.componentInstances.set('main', {
                template,
                parameters: params,
                isMain: true
            });
        }
    }

    /**
     * Parse signal connections
     * @param {string} content - Clean content
     */
    parseConnections(content) {
        // Parse various connection patterns
        const patterns = [
            // Simple assignments: a <== b
            /(\w+(?:\[[^\]]*\])*)\s*<==\s*([^;]+);/g,
            // Arrow assignments: a <-- b
            /(\w+(?:\[[^\]]*\])*)\s*<--\s*([^;]+);/g,
            // Equality constraints: a === b
            /(\w+(?:\[[^\]]*\])*)\s*===\s*([^;]+);/g,
            // Component output assignments: a.out ==> b
            /(\w+\.\w+(?:\[[^\]]*\])*)\s*==>\s*([^;]+);/g
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                this.connections.push({
                    from: match[2].trim(),
                    to: match[1].trim(),
                    type: this.getConnectionType(match[0])
                });
            }
        });
    }

    /**
     * Determine connection type from connection string
     * @param {string} connection - Connection string
     * @returns {string} Connection type
     */
    getConnectionType(connection) {
        if (connection.includes('<==')) return 'assignment';
        if (connection.includes('<--')) return 'signal';
        if (connection.includes('===')) return 'constraint';
        if (connection.includes('==>')) return 'output';
        return 'unknown';
    }
}

module.exports = CircomParser;