# ICD-10 Allowed-Set Builder

## Overview

The ICD-10 Allowed-Set Builder (`compiler/icd10_set_builder.js`) is a cryptographic tool that creates Poseidon Merkle trees for ICD-10 medical codes. This enables zero-knowledge proofs for medical code verification, allowing users to prove they have a diagnosis from an approved set without revealing the specific condition.

## Purpose and Use Cases

### Medical Privacy
- **Problem**: Traditional medical verification requires revealing sensitive diagnostic information
- **Solution**: Zero-knowledge proofs allow verification of eligibility without disclosure
- **Example**: Prove eligibility for a clinical trial requiring diabetes diagnosis without revealing the specific type or severity

### Cryptographic Approach
1. **Code Encoding**: Each ICD-10 code is hashed using SHA-256, then combined with a version root using Poseidon hash
2. **Merkle Tree**: Codes are organized into a binary Merkle tree using Poseidon hash function
3. **Zero-Knowledge Proofs**: The Merkle root serves as a public commitment, while individual codes can be proven using Merkle paths
4. **Version Control**: Version roots allow updating approved code sets without breaking existing proofs

## Features

### Build Modes

#### Mode A: Explicit Code List
Build from a simple text file containing ICD-10 codes (one per line):

```bash
node compiler/icd10_set_builder.js build \
  --codes examples/icd10_case/codes.txt \
  --version-root 0xICD10_V2025_08 \
  --out examples/icd10_case/allowed_set.json
```

**Input Format** (`codes.txt`):
```
A00
B00
C00
D00
E00
```

#### Mode B: Tree-Based Closure
Build from a hierarchical ICD-10 tree structure, automatically including all descendants of specified root codes:

```bash
node compiler/icd10_set_builder.js build \
  --tree examples/icd10_case/icd10_tree.json \
  --roots E10,E11 \
  --version-root 0xICD10_V2025_08 \
  --out examples/icd10_case/allowed_set.json
```

**Tree Format** (`icd10_tree.json`):
```json
{
  "E10": ["E10.0", "E10.1", "E10.9"],
  "E11": ["E11.0", "E11.1", "E11.9"],
  "E10.0": ["E10.00", "E10.01"],
  "E10.1": ["E10.10", "E10.11"]
}
```

**Closure Algorithm**: Uses depth-first search to find all descendants of root codes, ensuring comprehensive coverage of related diagnoses.

### Path Generation Mode
Generate Merkle proof paths for zero-knowledge verification:

```bash
node compiler/icd10_set_builder.js path \
  --code E11.9 \
  --in examples/icd10_case/allowed_set.json
```

## Output Files

### Primary Output (`allowed_set.json`)
```json
{
  "version_root": "0x1234ABCD",
  "depth": 4,
  "root": "0x8a7b2c3d...",
  "leaves": [
    { "code": "A00", "index": 0 },
    { "code": "B00", "index": 1 },
    ...
  ]
}
```

**Fields:**
- `version_root`: Cryptographic version identifier for the code set
- `depth`: Binary tree depth (log₂ of next power of 2 ≥ code count)
- `root`: Merkle root hash (hex string)
- `leaves`: Array mapping codes to their tree indices

### Development Aid (`allowed_set.layers.json`)
Contains all Merkle tree layers as hex arrays, used for generating proof paths:

```json
[
  ["0x1a2b...", "0x3c4d...", ...],  // Leaf layer
  ["0x5e6f...", "0x7a8b...", ...],  // Layer 1
  ["0x9c0d...", "0x1e2f...", ...],  // Layer 2
  ["0x3a4b..."]                     // Root layer
]
```

### Proof Path Output
When using path mode, outputs a JSON structure for zero-knowledge proofs:

```json
{
  "code": "A00",
  "leaf": "0x2f4a...",
  "path": ["0x1b3c...", "0x4d5e...", "0x6f7a..."],
  "pathPos": [0, 1, 0]
}
```

**Fields:**
- `code`: Normalized ICD-10 code
- `leaf`: Poseidon hash of the code and version root
- `path`: Array of sibling hashes for Merkle path verification
- `pathPos`: Binary array indicating position (0=left child, 1=right child)

## Technical Implementation

### Code Normalization
All ICD-10 codes are normalized using the `normCode()` function:
- Converts to uppercase
- Trims whitespace
- Handles various input formats consistently

**Example:**
```javascript
normCode("  e11.9  ") === "E11.9"
normCode("a00") === "A00"
```

### Cryptographic Functions

#### Leaf Encoding
Each code is encoded using:
```
leaf = Poseidon(SHA-256(code), version_root)
```

**Security Properties:**
- SHA-256 provides collision resistance for code hashing
- Poseidon is optimized for zero-knowledge circuits
- Version root prevents cross-version proof replay

#### Merkle Tree Construction
1. **Padding**: Leaf array is padded with zeros to next power of 2
2. **Layer Construction**: Each layer built by hashing adjacent pairs
3. **Hash Function**: Poseidon([left_child, right_child])
4. **Root Computation**: Single hash at top of tree

**Tree Depth Calculation:**
```javascript
depth = Math.log2(nextPowerOf2(codeCount))
```

### Closure Algorithm (Mode B)
Implements depth-first search for hierarchical code expansion:

```javascript
function closureFromRoots(tree, roots) {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
        const cur = stack.pop();
        if (seen.has(cur)) continue;
        seen.add(cur);
        const children = tree[cur] || [];
        for (const child of children) stack.push(child);
    }
    return Array.from(seen).sort();
}
```

**Features:**
- Prevents infinite loops through duplicate detection
- Includes root codes even if they have no children
- Deterministic output through sorting

## API Reference

### Command Line Interface

#### build command
```bash
node compiler/icd10_set_builder.js build [options]
```

**Options:**
- `--codes <file>`: Text file with ICD-10 codes (one per line)
- `--tree <file>`: JSON file with hierarchical code structure
- `--roots <csv>`: Comma-separated list of root codes (used with --tree)
- `--version-root <value>`: Version identifier (hex or decimal)
- `--out <file>`: Output path for allowed_set.json

**Requirements:**
- Must provide either `--codes` OR (`--tree` AND `--roots`)
- `--version-root` is always required
- `--out` specifies output file path

#### path command
```bash
node compiler/icd10_set_builder.js path [options]
```

**Options:**
- `--code <code>`: ICD-10 code to generate path for
- `--in <file>`: Input allowed_set.json file

### Internal Functions

#### Core Functions
- `encodeLeaf(poseidon, code, version_root)`: Encodes a single code as Merkle leaf
- `buildMerkle(poseidon, leaves)`: Constructs complete Merkle tree
- `merklePath(layers, index)`: Generates proof path for given leaf index
- `normCode(code)`: Normalizes ICD-10 code format

#### Utility Functions
- `loadTree(path)`: Loads and validates hierarchical code structure
- `closureFromRoots(tree, roots)`: Expands root codes to include all descendants
- `nextPow2(n)`: Calculates next power of 2 ≥ n

## Security Considerations

### Cryptographic Security
- **Hash Functions**: SHA-256 and Poseidon provide collision resistance
- **Version Roots**: Prevent replay attacks across different code sets
- **Deterministic Construction**: Ensures reproducible Merkle roots

### Privacy Properties
- **Code Confidentiality**: Individual codes are not revealed in proofs
- **Set Membership**: Only proves membership, not specific code
- **Unlinkability**: Multiple proofs from same user are unlinkable

### Operational Security
- **Input Validation**: Validates tree structures and code formats
- **Error Handling**: Fails securely on invalid inputs
- **File Permissions**: Consider restricting access to sensitive code lists

## Performance Characteristics

### Time Complexity
- **Tree Construction**: O(n log n) where n is number of codes
- **Path Generation**: O(log n) for single code proof
- **Closure Expansion**: O(|V| + |E|) where V=codes, E=relationships

### Space Complexity
- **Memory Usage**: O(n) for tree construction
- **Storage Requirements**: 
  - `allowed_set.json`: ~100 bytes per code
  - `allowed_set.layers.json`: ~32 bytes per tree node

### Scalability Limits
- **Maximum Codes**: Limited by available memory (typically >100,000 codes)
- **Tree Depth**: Increases logarithmically with code count
- **Proof Size**: Constant O(log n) regardless of total codes

## Examples and Use Cases

### Clinical Trial Eligibility
```bash
# Build diabetes-related codes
node compiler/icd10_set_builder.js build \
  --tree icd10_diabetes.json \
  --roots E10,E11,E12,E13,E14 \
  --version-root 0xDIABETES_2025 \
  --out diabetes_allowed.json

# Generate proof for specific diagnosis
node compiler/icd10_set_builder.js path \
  --code E11.9 \
  --in diabetes_allowed.json
```

### Insurance Coverage Verification
```bash
# Build covered procedure codes
node compiler/icd10_set_builder.js build \
  --codes covered_procedures.txt \
  --version-root 0xINSURANCE_2025_Q1 \
  --out coverage_allowed.json
```

### Research Data Classification
```bash
# Build mental health condition codes
node compiler/icd10_set_builder.js build \
  --tree icd10_full.json \
  --roots F20,F21,F22,F23,F24,F25 \
  --version-root 0xMENTAL_HEALTH_2025 \
  --out mental_health_allowed.json
```

## Error Handling

### Common Errors
- **Missing Arguments**: Clear error messages for required parameters
- **Invalid Files**: Validation of JSON structure and file accessibility
- **Code Not Found**: Specific error when requesting path for non-existent code
- **Invalid Tree**: Validation that all tree children are arrays

### Error Codes
- `1`: Missing required command line arguments
- `2`: Code not found in allowed set (path command)
- General exceptions for file I/O and JSON parsing errors

## Integration with Zero-Knowledge Circuits

### Circuit Integration
The output from this tool is designed for use with Circom circuits:

```circom
template ICD10Verifier(depth) {
    // Public inputs
    signal public merkleRoot;
    signal public versionRoot;
    
    // Private inputs  
    signal private code;
    signal private pathElements[depth];
    signal private pathIndices[depth];
    
    // Verification logic using Poseidon hash
    // ...
}
```

### Proof Generation
1. Use `build` command to create allowed set
2. Use `path` command to generate proof data
3. Feed proof data into zero-knowledge circuit
4. Generate and verify zkSNARK proof

This documentation provides a comprehensive guide to understanding and using the ICD-10 Allowed-Set Builder for privacy-preserving medical code verification systems.