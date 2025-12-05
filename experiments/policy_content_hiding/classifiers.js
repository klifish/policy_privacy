/**
 * Attack Modeling for Policy Content Hiding Evaluation
 * 
 * Implements simple classifiers to test if adversaries can infer
 * policy content from observable features.
 */

/**
 * Logistic Regression Classifier (binary)
 * Simple implementation without external dependencies
 */
class LogisticRegression {
  constructor(learningRate = 0.01, iterations = 1000) {
    this.learningRate = learningRate;
    this.iterations = iterations;
    this.weights = null;
    this.bias = 0;
  }
  
  sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
  }
  
  train(X, y) {
    const m = X.length;
    const n = X[0].length;
    
    // Initialize weights
    this.weights = new Array(n).fill(0);
    this.bias = 0;
    
    // Gradient descent
    for (let iter = 0; iter < this.iterations; iter++) {
      const predictions = X.map(x => {
        const z = x.reduce((sum, xi, i) => sum + xi * this.weights[i], this.bias);
        return this.sigmoid(z);
      });
      
      // Calculate gradients
      const dw = new Array(n).fill(0);
      let db = 0;
      
      for (let i = 0; i < m; i++) {
        const error = predictions[i] - y[i];
        db += error;
        for (let j = 0; j < n; j++) {
          dw[j] += error * X[i][j];
        }
      }
      
      // Update weights
      for (let j = 0; j < n; j++) {
        this.weights[j] -= this.learningRate * dw[j] / m;
      }
      this.bias -= this.learningRate * db / m;
    }
  }
  
  predict(X) {
    return X.map(x => {
      const z = x.reduce((sum, xi, i) => sum + xi * this.weights[i], this.bias);
      return this.sigmoid(z) >= 0.5 ? 1 : 0;
    });
  }
  
  predictProba(X) {
    return X.map(x => {
      const z = x.reduce((sum, xi, i) => sum + xi * this.weights[i], this.bias);
      return this.sigmoid(z);
    });
  }
}

/**
 * Simple Decision Tree for multi-class classification
 */
class DecisionTreeNode {
  constructor() {
    this.featureIndex = null;
    this.threshold = null;
    this.left = null;
    this.right = null;
    this.label = null;
  }
}

class SimpleDecisionTree {
  constructor(maxDepth = 5) {
    this.maxDepth = maxDepth;
    this.root = null;
  }
  
  giniImpurity(y) {
    const counts = {};
    y.forEach(label => counts[label] = (counts[label] || 0) + 1);
    
    let impurity = 1;
    for (const label in counts) {
      const p = counts[label] / y.length;
      impurity -= p * p;
    }
    return impurity;
  }
  
  split(X, y, featureIndex, threshold) {
    const leftX = [], leftY = [], rightX = [], rightY = [];
    
    for (let i = 0; i < X.length; i++) {
      if (X[i][featureIndex] <= threshold) {
        leftX.push(X[i]);
        leftY.push(y[i]);
      } else {
        rightX.push(X[i]);
        rightY.push(y[i]);
      }
    }
    
    return { leftX, leftY, rightX, rightY };
  }
  
  findBestSplit(X, y) {
    const n = X[0].length;
    let bestGain = 0;
    let bestFeature = 0;
    let bestThreshold = 0;
    
    const parentImpurity = this.giniImpurity(y);
    
    for (let feature = 0; feature < n; feature++) {
      const values = X.map(x => x[feature]);
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
      
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
        const { leftY, rightY } = this.split(X, y, feature, threshold);
        
        if (leftY.length === 0 || rightY.length === 0) continue;
        
        const leftImpurity = this.giniImpurity(leftY);
        const rightImpurity = this.giniImpurity(rightY);
        
        const gain = parentImpurity - (
          (leftY.length / y.length) * leftImpurity +
          (rightY.length / y.length) * rightImpurity
        );
        
        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = feature;
          bestThreshold = threshold;
        }
      }
    }
    
    return { feature: bestFeature, threshold: bestThreshold, gain: bestGain };
  }
  
  buildTree(X, y, depth = 0) {
    const node = new DecisionTreeNode();

    // Check stopping criteria
    const uniqueLabels = [...new Set(y)];
    if (uniqueLabels.length === 1 || depth >= this.maxDepth || X.length < 2) {
      // Leaf node - assign majority class
      const counts = {};
      y.forEach(label => counts[label] = (counts[label] || 0) + 1);
      const majorityLabel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      // Convert back to original type (number if it's numeric)
      node.label = isNaN(majorityLabel) ? majorityLabel : Number(majorityLabel);
      return node;
    }

    // Find best split
    const { feature, threshold, gain } = this.findBestSplit(X, y);

    if (gain === 0) {
      // Can't split further
      const counts = {};
      y.forEach(label => counts[label] = (counts[label] || 0) + 1);
      const majorityLabel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      // Convert back to original type (number if it's numeric)
      node.label = isNaN(majorityLabel) ? majorityLabel : Number(majorityLabel);
      return node;
    }
    
    // Split and recurse
    node.featureIndex = feature;
    node.threshold = threshold;
    
    const { leftX, leftY, rightX, rightY } = this.split(X, y, feature, threshold);
    node.left = this.buildTree(leftX, leftY, depth + 1);
    node.right = this.buildTree(rightX, rightY, depth + 1);
    
    return node;
  }
  
  train(X, y) {
    this.root = this.buildTree(X, y);
  }
  
  predictOne(x, node = this.root) {
    if (node.label !== null) {
      return node.label;
    }
    
    if (x[node.featureIndex] <= node.threshold) {
      return this.predictOne(x, node.left);
    } else {
      return this.predictOne(x, node.right);
    }
  }
  
  predict(X) {
    return X.map(x => this.predictOne(x));
  }
}

/**
 * Random Forest Classifier (simplified)
 */
class RandomForest {
  constructor(nTrees = 10, maxDepth = 5) {
    this.nTrees = nTrees;
    this.maxDepth = maxDepth;
    this.trees = [];
  }
  
  bootstrapSample(X, y) {
    const n = X.length;
    const sampleX = [];
    const sampleY = [];
    
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      sampleX.push(X[idx]);
      sampleY.push(y[idx]);
    }
    
    return { sampleX, sampleY };
  }
  
  train(X, y) {
    this.trees = [];
    
    for (let i = 0; i < this.nTrees; i++) {
      const tree = new SimpleDecisionTree(this.maxDepth);
      const { sampleX, sampleY } = this.bootstrapSample(X, y);
      tree.train(sampleX, sampleY);
      this.trees.push(tree);
    }
  }
  
  predict(X) {
    // Majority vote across trees
    const predictions = this.trees.map(tree => tree.predict(X));
    
    return X.map((_, i) => {
      const votes = new Map();
      predictions.forEach(pred => {
        const label = pred[i];
        votes.set(label, (votes.get(label) || 0) + 1);
      });

      let bestLabel = null;
      let bestVotes = -1;
      votes.forEach((count, label) => {
        if (count > bestVotes) {
          bestVotes = count;
          bestLabel = label;
        }
      });

      return bestLabel;
    });
  }
}

module.exports = {
  LogisticRegression,
  SimpleDecisionTree,
  RandomForest
};
