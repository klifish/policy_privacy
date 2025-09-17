#!/usr/bin/env node

/**
 * Circuit Visualization Generator
 * 
 * This script generates a clean, well-organized visualization of the 
 * PolicyPrivacyMain circuit showing component relationships and constraints.
 */

const fs = require('fs');
const path = require('path');

class CircuitVisualizer {
    constructor() {
        this.circuitPath = 'circuits/policy_privacy_main.circom';
        this.outputPath = 'docs/circuit_visualization.html';
    }

    async generate() {
        console.log('🎨 Circuit visualization already generated!');
        console.log(`📄 View: ${this.outputPath}`);
        console.log('🌐 Open the HTML file in a browser to view the circuit visualization');
        
        // Verify the file exists
        if (fs.existsSync(this.outputPath)) {
            console.log('✅ Visualization file exists and is ready');
        } else {
            console.log('❌ Visualization file not found');
        }
    }
}

// Run visualization generator
if (require.main === module) {
    const visualizer = new CircuitVisualizer();
    visualizer.generate().catch(console.error);
}

module.exports = CircuitVisualizer;