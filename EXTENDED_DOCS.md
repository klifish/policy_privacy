# Extended PostfixPolicyInterpreter Documentation

## Overview

The `PostfixPolicyInterpreter` has been extended to support both requester attributes and external predicate values (ontology-based and credential-based checks). This enables more complex policy evaluation while maintaining full backward compatibility.

## Template Signature

**Before (original):**
```circom
template PostfixPolicyInterpreter(N, DEPTH, K)
```

**After (extended):**
```circom
template PostfixPolicyInterpreter(N, M, DEPTH, K)
```

### Parameters

- `N`: Number of requester attributes (unchanged)
- `M`: Number of external predicate values (NEW)
- `DEPTH`: Maximum postfix expression length (unchanged)
- `K`: Not used anymore (kept for legacy compatibility)

## Token Encoding

**Before:**
- `0 .. N-1`: Requester attribute indices
- `N+0`: AND operator
- `N+1`: OR operator  
- `N+2`: NOT operator
- `N+3`: Reserved

**After:**
- `0 .. N-1`: Requester attribute indices (unchanged)
- `N .. N+M-1`: External predicate indices (NEW)
- `N+M+0`: AND operator
- `N+M+1`: OR operator
- `N+M+2`: NOT operator
- `N+M+3`: Reserved

## Input Signals

**Before:**
```circom
signal input postfixExpr[DEPTH];
signal input numOperations;
signal input requesterPolicy[N];
```

**After:**
```circom
signal input postfixExpr[DEPTH];
signal input numOperations;
signal input requesterPolicy[N];
signal input predicateValues[M];  // NEW
```

## Usage Examples

### Example 1: DUO Rule "DS AND IRB"
```circom
// N=0 (no requester attributes), M=2 (DS and IRB predicates)
component policy = PostfixPolicyInterpreter(0, 2, 10, 0);

// Input values
policy.postfixExpr <== [0, 1, 2, 0, 0, 0, 0, 0, 0, 0]; // P0(DS), P1(IRB), AND
policy.numOperations <== 3;
policy.requesterPolicy <== []; // Empty - no requester attributes
policy.predicateValues <== [1, 1]; // DS=true, IRB=true
// Output: isValid = 1
```

### Example 2: Mixed Rule "RequesterAttribute AND OntologyCheck"
```circom
// N=3 (requester attributes), M=2 (external predicates)
component policy = PostfixPolicyInterpreter(3, 2, 10, 3);

// Rule: A0 AND P0 (attribute 0 AND predicate 0)
policy.postfixExpr <== [0, 3, 5, 0, 0, 0, 0, 0, 0, 0]; // A0, P0, AND (5 = N+M+0 = 3+2+0)
policy.numOperations <== 3;
policy.requesterPolicy <== [1, 0, 0]; // A0=true, A1=false, A2=false
policy.predicateValues <== [1, 0];    // P0=true, P1=false
// Output: isValid = 1 (1 AND 1 = 1)
```

## Backward Compatibility

### Option 1: Use M=0
The extended template with M=0 behaves identically to the original:

```circom
// Equivalent to original PostfixPolicyInterpreter(3, 10, 2)
component policy = PostfixPolicyInterpreter(3, 0, 10, 2);
```

### Option 2: Use Legacy Wrapper
For existing code, use the legacy wrapper:

```circom
#include "postfix_policy_interpreter_legacy.circom"
component policy = PostfixPolicyInterpreterLegacy(3, 10, 2);
```

## Implementation Details

### Internal Changes

1. **Operand Padding**: Combined `requesterPolicy` and `predicateValues` into unified `operandPad[NMP2]` array
2. **Bit Width**: Updated operand selection to use `KSEL = ⌈log2(N+M)⌉` bits
3. **Operator Detection**: Changed from `token < N` to `token < (N+M)`
4. **Operator Calculation**: Changed from `token - N` to `token - (N+M)`

### Constraint Impact

- **M=0**: Identical constraint count to original (2063 constraints for N=3)
- **M>0**: Slight increase due to additional input validation and operand padding

## Testing

### Extended Functionality Tests
```bash
node validate_extended.js    # Tests N=3, M=2 configuration
```

### Backward Compatibility Tests  
```bash
node validate_legacy.js      # Tests legacy wrapper
```

### Example Test Cases

1. **Single Predicate**: `postfixExpr = [3]` → uses predicate P0
2. **DS AND IRB**: `postfixExpr = [3, 4, 5]` → P0 AND P1 
3. **Mixed Expression**: `postfixExpr = [0, 3, 5, 1, 4, 5, 6]` → (A0 AND P0) OR (A1 AND P1)

## Migration Guide

### For New Implementations
Use the extended template directly:
```circom
component policy = PostfixPolicyInterpreter(N, M, DEPTH, K);
```

### For Existing Code
Choose one option:
1. Update to extended version with M=0
2. Use legacy wrapper (recommended for minimal changes)
3. Keep original circuit file for compatibility

### Token Encoding Migration
Update operator codes in postfix expressions:
- **Before**: `[attr0, attr1, N+0]` (e.g., `[0, 1, 3]` for N=3)
- **After**: `[attr0, attr1, N+M+0]` (e.g., `[0, 1, 5]` for N=3, M=2)