'use strict';

/**
 * Policy generator:
 *  - normalizes author-provided DUO attributes and ontology predicates
 *  - compiles infix logic into postfix tokens understood by PostfixPolicyInterpreter
 *  - hashes the resulting program and emits Poseidon commitments
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const circomlibjs = require('circomlibjs');

const {
  NAMESPACE_ALIASES,
  toHex
} = require('../utils/merkle/ontology_whitelist');

// Canonical attribute ordering and metadata.
const ATTRIBUTE_DEFINITIONS = [
  { code: 'GR', label: 'General research use', namespace: null, requiresPredicate: false },
  { code: 'DS', label: 'Disease-specific research', namespace: 'ICD10', requiresPredicate: true },
  { code: 'RS', label: 'Research-specific restrictions', namespace: 'OBI', requiresPredicate: true },
  { code: 'POA', label: 'Population origins/ancestry', namespace: 'HANCESTRO', requiresPredicate: true },
  { code: 'GS', label: 'Geographical restriction', namespace: 'ISO3166', requiresPredicate: true },
  { code: 'CC', label: 'Clinical care use', namespace: 'SNOMED', requiresPredicate: true },
  { code: 'CU', label: 'Commercial use', namespace: null, requiresPredicate: false }
];
const PRODUCTION_ATTRIBUTE_ORDER = Object.freeze(['GR', 'DS', 'RS', 'POA', 'GS', 'CC']);
const PRODUCTION_N = 6;
const PRODUCTION_M = 5;

const SCOPED_DUO_TERMS = Object.freeze({
  US: { code: 'US', duoId: 'DUO0000026', scopeKind: 26 },
  PS: { code: 'PS', duoId: 'DUO0000027', scopeKind: 27 },
  IS: { code: 'IS', duoId: 'DUO0000028', scopeKind: 28 }
});

// Flexible identifier mapping for DUO attributes.
const ATTRIBUTE_ALIAS_MAP = Object.freeze({
  GR: 'GR',
  GENERAL_RESEARCH: 'GR',
  GENERAL_RESEARCH_USE: 'GR',
  GENERALRESEARCH: 'GR',
  DUO0000042: 'GR',

  DS: 'DS',
  DISEASE_SPECIFIC: 'DS',
  DISEASE_SPECIFIC_RESEARCH: 'DS',
  DISEASESPECIFIC: 'DS',
  DUO0000007: 'DS',

  RS: 'RS',
  RESEARCH_SPECIFIC: 'RS',
  RESEARCH_SPECIFIC_RESTRICTIONS: 'RS',
  RESEARCHSPECIFIC: 'RS',
  DUO0000012: 'RS',

  POA: 'POA',
  POPULATION_ORIGINS_ANCESTRY: 'POA',
  POPULATION_ANCESTRY: 'POA',
  POPULATIONORIGINS: 'POA',
  DUO0000011: 'POA',

  GS: 'GS',
  GEOGRAPHICAL_RESTRICTION: 'GS',
  GEOGRAPHIC_RESTRICTION: 'GS',
  DUO0000022: 'GS',

  CC: 'CC',
  CLINICAL_CARE: 'CC',
  CLINICALCARE: 'CC',
  DUO0000043: 'CC',

  CU: 'CU',
  COMMERCIAL_USE: 'CU',
  COMMERCIAL: 'CU',
  DUO0000046: 'CU'
});

const SCOPED_ALIAS_MAP = Object.freeze({
  US: 'US', USER_SPECIFIC: 'US', USER_SPECIFIC_RESTRICTION: 'US', DUO0000026: 'US',
  PS: 'PS', PROJECT_SPECIFIC: 'PS', PROJECT_SPECIFIC_RESTRICTION: 'PS', DUO0000027: 'PS',
  IS: 'IS', INSTITUTION_SPECIFIC: 'IS', INSTITUTION_SPECIFIC_RESTRICTION: 'IS', DUO0000028: 'IS'
});

// Operator table used by shunting-yard during logic parsing.
const OP_INFO = Object.freeze({
  NOT: { precedence: 3, arity: 1, assoc: 'right' },
  AND: { precedence: 2, arity: 2, assoc: 'left' },
  OR: { precedence: 1, arity: 2, assoc: 'left' }
});

/**
 * Resolve a caller-provided attribute ordering into metadata records.
 */
function resolveAttributeDefinitions(order) {
  if (!order || order.length === 0) {
    return PRODUCTION_ATTRIBUTE_ORDER.map((code) => ATTRIBUTE_DEFINITIONS.find((d) => d.code === code));
  }
  const defs = [];
  order.forEach((entry, idx) => {
    const canonical = canonicalizeAttribute(entry);
    const def = ATTRIBUTE_DEFINITIONS.find((d) => d.code === canonical);
    if (!def) {
      throw new Error(`Unknown attribute code in attributeOrder[${idx}]: ${entry}`);
    }
    defs.push(def);
  });
  return defs;
}

// Normalize DUO attribute identifiers to canonical codes.
function canonicalizeAttribute(name) {
  if (!name) {
    throw new Error('Attribute identifier is required');
  }
  const key = String(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  const mapped = ATTRIBUTE_ALIAS_MAP[key];
  if (!mapped) {
    throw new Error(`Unknown attribute identifier: ${name}`);
  }
  return mapped;
}

function canonicalizeScopedTerm(name) {
  if (!name) return null;
  const key = String(name).trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return SCOPED_ALIAS_MAP[key] || null;
}

// Normalize ontology namespace identifiers by consulting alias table.
function canonicalizeNamespace(value) {
  if (!value && value !== 0) {
    throw new Error('Predicate namespace is required');
  }
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  for (const [alias, canonical] of Object.entries(NAMESPACE_ALIASES)) {
    const aliasNormalized = String(alias)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (aliasNormalized === normalized) {
      return canonical;
    }
  }
  switch (normalized) {
    case 'ICD10':
      return 'ICD10';
    case 'OBI':
      return 'OBI';
    case 'HANCESTRO':
      return 'HANCESTRO';
    case 'ISO3166':
      return 'ISO3166';
    case 'SNOMED':
    case 'SNOMEDCT':
      return 'SNOMED';
    default:
      throw new Error(`Unknown ontology namespace: ${value}`);
  }
}

/**
 * Build attribute lookup helpers (bitmap, index, namespace bindings).
 */
function buildAttributeContext(attributeDefs, inputAttributes = {}) {
  const indexByCode = new Map();
  attributeDefs.forEach((def, idx) => indexByCode.set(def.code, idx));

  const canonicalMap = {};
  Object.entries(inputAttributes || {}).forEach(([key, value]) => {
    const canonical = canonicalizeAttribute(key);
    canonicalMap[canonical] = value;
  });

  const bitmap = attributeDefs.map((def) => {
    const value = canonicalMap.hasOwnProperty(def.code) ? canonicalMap[def.code] : undefined;
    if (value === undefined) {
      return 0;
    }
    if (value === true || value === 1 || value === '1' || value === 'true') {
      return 1;
    }
    if (value === false || value === 0 || value === '0' || value === 'false') {
      return 0;
    }
    throw new Error(`Attribute ${def.code} must be boolean, got: ${value}`);
  });

  return {
    order: attributeDefs.map((def) => def.code),
    bitmap,
    indexByCode,
    namespaceByCode: attributeDefs.reduce((acc, def) => {
      acc[def.code] = def.namespace ?? null;
      return acc;
    }, {}),
    requiresPredicateByCode: attributeDefs.reduce((acc, def) => {
      acc[def.code] = Boolean(def.requiresPredicate && def.namespace);
      return acc;
    }, {}),
    definitions: attributeDefs
  };
}

/**
 * Validate predicate slot declarations and ensure namespaces are unique.
 */
function buildPredicateContext(predicates = []) {
  if (!Array.isArray(predicates)) {
    throw new Error('predicates must be an array');
  }
  const bySlot = new Map();
  const namespaceToSlot = new Map();
  const scopeToSlot = new Map();

  predicates.forEach((raw, idx) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Predicate at index ${idx} must be an object`);
    }
    if (!Number.isInteger(raw.slot) || raw.slot < 0) {
      throw new Error(`Predicate slot must be a non-negative integer (index ${idx})`);
    }
    if (bySlot.has(raw.slot)) {
      throw new Error(`Duplicate predicate slot: ${raw.slot}`);
    }
    const rawDuo = raw.duo ?? raw.code ?? raw.attribute;
    const scopedTerm = canonicalizeScopedTerm(rawDuo);
    if (scopedTerm) {
      if (raw.scopeId === undefined || raw.scopeId === null || raw.scopeId === '') {
        throw new Error(`Scoped predicate ${scopedTerm} requires scopeId`);
      }
      if (raw.namespace ?? raw.ns ?? raw.ontology) {
        throw new Error(`Scoped predicate ${scopedTerm} must not declare an ontology namespace`);
      }
      if (scopeToSlot.has(scopedTerm)) {
        throw new Error(`Only one ${scopedTerm} scoped predicate is allowed per policy`);
      }
      bySlot.set(raw.slot, {
        slot: raw.slot,
        duo: scopedTerm,
        kind: 'scoped',
        scopeKind: SCOPED_DUO_TERMS[scopedTerm].scopeKind,
        scopeId: raw.scopeId,
        description: raw.description ?? null
      });
      scopeToSlot.set(scopedTerm, raw.slot);
    } else {
      const duoCode = canonicalizeAttribute(rawDuo);
      const namespace = canonicalizeNamespace(raw.namespace ?? raw.ns ?? raw.ontology);
      bySlot.set(raw.slot, {
        slot: raw.slot,
        duo: duoCode,
        kind: 'ontology',
        namespace,
        root: raw.root ?? null,
        description: raw.description ?? null
      });
      if (namespaceToSlot.has(namespace)) {
        throw new Error(`Namespace ${namespace} already mapped to slot ${namespaceToSlot.get(namespace)}`);
      }
      namespaceToSlot.set(namespace, raw.slot);
    }
  });

  if (bySlot.size === 0) {
    throw new Error('At least one predicate slot must be defined');
  }

  const slots = Array.from(bySlot.keys()).sort((a, b) => a - b);
  slots.forEach((slot, idx) => {
    if (slot !== idx) {
      throw new Error(`Predicate slots must be contiguous starting at 0 (missing slot ${idx})`);
    }
  });

  return {
    slots: slots.map((slot) => bySlot.get(slot)),
    namespaceToSlot,
    scopeToSlot,
    scopeParameters: slots.map((slot) => {
      const predicate = bySlot.get(slot);
      return predicate.kind === 'scoped'
        ? { slot, scopeKind: predicate.scopeKind, approvedScopeId: String(predicate.scopeId) }
        : null;
    }).filter(Boolean)
  };
}

// Lightweight lexer for policy logic.
function tokenizeLogic(expr) {
  if (typeof expr !== 'string' || !expr.trim()) {
    throw new Error('logic string is required');
  }
  const tokens = [];
  const pushToken = (type, value) => tokens.push({ type, value });

  for (let i = 0; i < expr.length;) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      pushToken(ch === '(' ? 'LPAREN' : 'RPAREN', ch);
      i += 1;
      continue;
    }
    if (ch === '&') {
      if (expr[i + 1] === '&') i += 1;
      pushToken('OP', 'AND');
      i += 1;
      continue;
    }
    if (ch === '|') {
      if (expr[i + 1] === '|') i += 1;
      pushToken('OP', 'OR');
      i += 1;
      continue;
    }
    if (ch === '!') {
      pushToken('OP', 'NOT');
      i += 1;
      continue;
    }
    if ((ch === 'P' || ch === 'p') && expr[i + 1] === '[') {
      const endIdx = expr.indexOf(']', i + 2);
      if (endIdx === -1) {
        throw new Error('Unterminated predicate token (missing ])');
      }
      const inner = expr.slice(i + 2, endIdx).trim();
      if (!inner) {
        throw new Error('Empty predicate identifier inside P[...]');
      }
      const scopedTerm = canonicalizeScopedTerm(inner);
      pushToken('PREDICATE', scopedTerm || canonicalizeNamespace(inner));
      i = endIdx + 1;
      continue;
    }

    const identMatch = expr.slice(i).match(/^[A-Za-z0-9_:\-]+/);
    if (!identMatch) {
      throw new Error(`Unexpected token near "${expr.slice(i, i + 10)}"`);
    }
    const raw = identMatch[0];
    const upper = raw.toUpperCase();
    if (upper === 'AND') {
      pushToken('OP', 'AND');
    } else if (upper === 'OR') {
      pushToken('OP', 'OR');
    } else if (upper === 'NOT') {
      pushToken('OP', 'NOT');
    } else if (upper === 'TRUE' || upper === 'FALSE') {
      throw new Error('Boolean constants TRUE/FALSE are not supported in policy logic');
    } else {
      const scopedTerm = canonicalizeScopedTerm(raw);
      if (scopedTerm) {
        pushToken('PREDICATE', scopedTerm);
      } else {
        pushToken('ATTRIBUTE', canonicalizeAttribute(raw));
      }
    }
    i += raw.length;
  }

  return tokens;
}

// Convert infix tokens to RPN using shunting-yard.
function infixToRPN(tokens) {
  const output = [];
  const stack = [];

  tokens.forEach((tok) => {
    switch (tok.type) {
      case 'ATTRIBUTE':
      case 'PREDICATE':
        output.push(tok);
        break;
      case 'OP': {
        const info = OP_INFO[tok.value];
        if (!info) {
          throw new Error(`Unsupported operator: ${tok.value}`);
        }
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type !== 'OP') break;
          const topInfo = OP_INFO[top.value];
          if (!topInfo) break;
          const higher =
            info.assoc === 'left'
              ? info.precedence <= topInfo.precedence
              : info.precedence < topInfo.precedence;
          if (!higher) break;
          output.push(stack.pop());
        }
        stack.push(tok);
        break;
      }
      case 'LPAREN':
        stack.push(tok);
        break;
      case 'RPAREN': {
        let found = false;
        while (stack.length) {
          const popped = stack.pop();
          if (popped.type === 'LPAREN') {
            found = true;
            break;
          }
          output.push(popped);
        }
        if (!found) {
          throw new Error('Mismatched parentheses in logic expression');
        }
        break;
      }
      default:
        throw new Error(`Unsupported token type: ${tok.type}`);
    }
  });

  while (stack.length) {
    const popped = stack.pop();
    if (popped.type === 'LPAREN' || popped.type === 'RPAREN') {
      throw new Error('Mismatched parentheses in logic expression');
    }
    output.push(popped);
  }

  return output;
}

// Build an AST from RPN tokens to enable attribute binding.
function rpnToAst(rpnTokens) {
  const stack = [];
  rpnTokens.forEach((tok) => {
    if (tok.type === 'ATTRIBUTE' || tok.type === 'PREDICATE') {
      stack.push({ type: tok.type, value: tok.value });
      return;
    }
    if (tok.type === 'OP') {
      const info = OP_INFO[tok.value];
      if (!info) throw new Error(`Unsupported operator: ${tok.value}`);
      if (info.arity === 1) {
        if (stack.length < 1) {
          throw new Error(`Operator ${tok.value} requires 1 operand`);
        }
        const child = stack.pop();
        stack.push({ type: 'OP', op: tok.value, children: [child] });
      } else if (info.arity === 2) {
        if (stack.length < 2) {
          throw new Error(`Operator ${tok.value} requires 2 operands`);
        }
        const right = stack.pop();
        const left = stack.pop();
        stack.push({ type: 'OP', op: tok.value, children: [left, right] });
      } else {
        throw new Error(`Unsupported arity for operator ${tok.value}`);
      }
      return;
    }
    throw new Error(`Unexpected token type in RPN: ${tok.type}`);
  });
  if (stack.length !== 1) {
    throw new Error('Logic expression did not reduce to a single AST root');
  }
  return stack[0];
}

// Structural equality helper for AST simplification.
function nodesEqual(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'ATTRIBUTE' || a.type === 'PREDICATE') {
    return a.value === b.value;
  }
  if (a.type === 'OP') {
    if (a.op !== b.op || a.children.length !== b.children.length) return false;
    for (let i = 0; i < a.children.length; i += 1) {
      if (!nodesEqual(a.children[i], b.children[i])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Inject required ontology predicates (attribute ∧ predicate) per policy rules.
 */
function bindAttributes(ast, attributeCtx) {
  function bind(node) {
    if (node.type === 'ATTRIBUTE') {
      const namespace = attributeCtx.namespaceByCode[node.value];
      const requiresPredicate = attributeCtx.requiresPredicateByCode[node.value];
      if (requiresPredicate) {
        if (!namespace) {
          throw new Error(`Missing namespace binding for attribute ${node.value}`);
        }
        return {
          type: 'OP',
          op: 'AND',
          children: [
            { type: 'ATTRIBUTE', value: node.value },
            { type: 'PREDICATE', value: namespace, autoInserted: true }
          ],
          autoInserted: true
        };
      }
      return {
        type: 'ATTRIBUTE',
        value: node.value
      };
    }
    if (node.type === 'PREDICATE') {
      return node;
    }
    if (node.type === 'OP') {
      return {
        type: 'OP',
        op: node.op,
        children: node.children.map((child) => bind(child))
      };
    }
    throw new Error(`Unsupported AST node type: ${node.type}`);
  }

  function simplify(node) {
    if (node.type !== 'OP') {
      return node;
    }
    const simplifiedChildren = node.children.map((child) => simplify(child));
    if (node.op === 'AND' && simplifiedChildren.length === 2) {
      const [left, right] = simplifiedChildren;

      if (
        left.type === 'OP' &&
        left.op === 'AND' &&
        left.children.length === 2 &&
        right.type === 'PREDICATE' &&
        nodesEqual(left.children[1], right)
      ) {
        return left;
      }
      if (
        right.type === 'OP' &&
        right.op === 'AND' &&
        right.children.length === 2 &&
        left.type === 'PREDICATE' &&
        nodesEqual(right.children[1], left)
      ) {
        return right;
      }
    }
    return {
      type: 'OP',
      op: node.op,
      children: simplifiedChildren
    };
  }

  return simplify(bind(ast));
}

// Convert AST back to RPN sequence after binding.
function astToRPN(ast) {
  if (ast.type === 'ATTRIBUTE' || ast.type === 'PREDICATE') {
    return [ast];
  }
  if (ast.type === 'OP') {
    const info = OP_INFO[ast.op];
    if (!info) throw new Error(`Unsupported operator in AST: ${ast.op}`);
    const parts = [];
    ast.children.forEach((child) => {
      parts.push(...astToRPN(child));
    });
    parts.push({ type: 'OP', value: ast.op });
    return parts;
  }
  throw new Error(`Unsupported AST node type during RPN conversion: ${ast.type}`);
}

// Pretty-print AST for debugging/documentation.
function astToInfix(ast) {
  if (ast.type === 'ATTRIBUTE') {
    return ast.value;
  }
  if (ast.type === 'PREDICATE') {
    return `P[${ast.value}]`;
  }
  if (ast.type === 'OP') {
    if (ast.op === 'NOT') {
      return `!${astToInfix(ast.children[0])}`;
    }
    const opSymbol = ast.op === 'AND' ? '&' : '|';
    const [left, right] = ast.children;
    return `(${astToInfix(left)} ${opSymbol} ${astToInfix(right)})`;
  }
  throw new Error(`Unsupported AST node type in infix conversion: ${ast.type}`);
}

let poseidonPromise = null;

// Poseidon builder with memoization to avoid repeated instantiation.
async function buildPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = circomlibjs.buildPoseidon();
  }
  return poseidonPromise;
}

function poseidonToBigInt(poseidon, value) {
  return BigInt(poseidon.F.toString(value));
}

// Accept multiple randomizer encodings from CLI / config.
function parseRandomizer(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('randomizer must be a non-negative finite number');
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    if (/^\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    throw new Error(`Invalid randomizer format: ${value}`);
  }
  throw new Error('Unsupported randomizer value type');
}

// Generate a non-zero randomizer by sampling field-sized bytes.
function generateRandomizerBytes(byteLength = 31) {
  let candidate = 0n;
  while (candidate === 0n) {
    const buf = crypto.randomBytes(byteLength);
    candidate = BigInt('0x' + buf.toString('hex'));
  }
  return candidate;
}

/**
 * Map logical tokens into numeric codes understood by the circuit.
 */
function rpnToNumeric(rpnTokens, attributeCtx, predicateCtx, N = PRODUCTION_N, M = PRODUCTION_M) {
  const namespaceToSlot = predicateCtx.namespaceToSlot;
  const scopeToSlot = predicateCtx.scopeToSlot;
  const attributeIndexByCode = attributeCtx.indexByCode;

  const tokens = [];
  rpnTokens.forEach((tok) => {
    if (tok.type === 'ATTRIBUTE') {
      // The production circuit uses a stable six-slot operand layout even
      // when an author provides a shorter presentation order.
      const idx = PRODUCTION_ATTRIBUTE_ORDER.indexOf(tok.value);
      if (idx === undefined) {
        throw new Error(`Attribute ${tok.value} was not declared`);
      }
      if (idx < 0) {
        throw new Error(`Attribute ${tok.value} is not supported by the V2 production circuit`);
      }
      tokens.push(idx);
    } else if (tok.type === 'PREDICATE') {
      const slot = namespaceToSlot.has(tok.value)
        ? namespaceToSlot.get(tok.value)
        : scopeToSlot.get(tok.value);
      if (slot === undefined) {
        throw new Error(`No predicate slot declared for ${tok.value}`);
      }
      tokens.push(N + slot);
    } else if (tok.type === 'OP') {
      if (tok.value === 'AND') {
        tokens.push(N + M + 0);
      } else if (tok.value === 'OR') {
        tokens.push(N + M + 1);
      } else if (tok.value === 'NOT') {
        tokens.push(N + M + 2);
      } else {
        throw new Error(`Unsupported operator during numeric emission: ${tok.value}`);
      }
    } else {
      throw new Error(`Unsupported RPN token type during numeric emission: ${tok.type}`);
    }
  });

  return tokens;
}

/**
 * Main entry point: normalize policy JSON and emit circuit artifacts.
 */
async function generatePolicyArtifacts(config, options = {}) {
  const { depth = 20, randomizer, attributeOrder } = options;
  if (!Number.isInteger(depth) || depth <= 0) {
    throw new Error('depth must be a positive integer');
  }

  const attributeDefs = resolveAttributeDefinitions(attributeOrder);

  const attributeCtx = buildAttributeContext(attributeDefs, config.attributes || {});
  // console.log(`Attribute context: ${JSON.stringify(attributeCtx, null, 2)}`);
  const predicateCtx = buildPredicateContext(config.predicates || []);
  if (predicateCtx.slots.length > PRODUCTION_M) {
    throw new Error(`V2 production circuit supports at most ${PRODUCTION_M} predicate slots`);
  }

  predicateCtx.slots.forEach((slotInfo) => {
    if (slotInfo.kind === 'scoped') {
      return;
    }
    const expectedNamespace = attributeCtx.namespaceByCode[slotInfo.duo];
    if (expectedNamespace === undefined) {
      throw new Error(`Predicate slot ${slotInfo.slot} references attribute ${slotInfo.duo} not present in attributeOrder`);
    }
    if (attributeCtx.requiresPredicateByCode[slotInfo.duo]) {
      if (slotInfo.namespace !== expectedNamespace) {
        throw new Error(
          `Predicate slot ${slotInfo.slot} namespace mismatch: expected ${expectedNamespace} for ${slotInfo.duo}, got ${slotInfo.namespace}`
        );
      }
    } else if (slotInfo.namespace !== expectedNamespace && expectedNamespace !== null) {
      throw new Error(
        `Predicate slot ${slotInfo.slot} namespace mismatch: expected ${expectedNamespace} for ${slotInfo.duo}, got ${slotInfo.namespace}`
      );
    }
  });

  const tokens = tokenizeLogic(config.logic);
  // console.log(`Tokenized logic: ${tokens.map((t) => t.value).join(' ')}`);
  const baseRpn = infixToRPN(tokens);
  // console.log(baseRpn.map((t) => `${t.type}(${t.value})`).join(' '));
  const ast = rpnToAst(baseRpn);
  // console.log(`Parsed AST: ${JSON.stringify(ast, null, 2)}`);

  const boundAst = bindAttributes(ast, attributeCtx);
  // console.log(`AST after attribute binding: ${JSON.stringify(boundAst, null, 2)}`);

  const expandedRpn = astToRPN(boundAst);
  // console.log(`Final RPN tokens after binding: ${expandedRpn.map((t) => `${t.type}(${t.value})`).join(' ')}`);
  const numericTokens = rpnToNumeric(expandedRpn, attributeCtx, predicateCtx, PRODUCTION_N, PRODUCTION_M);

  if (numericTokens.length > depth) {
    throw new Error(
      `Token sequence length ${numericTokens.length} exceeds depth ${depth}. Increase depth or simplify logic.`
    );
  }

  const policy = Array.from({ length: depth }, (_, i) => numericTokens[i] ?? 0);

  const poseidon = await buildPoseidon();
  const policyBigInts = policy.map((v) => BigInt(v));

  // Hash the policy using tree-based hashing for DEPTH > 16
  // This matches the circuit's tree-based hashing in policy_commitment.circom
  let policyHash;
  if (policyBigInts.length <= 16) {
    // Direct hashing for small policies
    policyHash = poseidon(policyBigInts);
  } else {
    // Tree-based hashing for large policies (DEPTH > 16)
    const chunkSize = 16;
    const numChunks = Math.ceil(policyBigInts.length / chunkSize);
    const chunkHashes = [];

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, policyBigInts.length);
      const chunk = policyBigInts.slice(start, end);
      const chunkHash = poseidon(chunk);
      chunkHashes.push(chunkHash);
    }

    // Hash all chunk hashes together
    policyHash = poseidon(chunkHashes);
  }

  const policyHashBigInt = poseidonToBigInt(poseidon, policyHash);

  const chosenRandomizer = parseRandomizer(randomizer) ?? generateRandomizerBytes();
  // The program length is bound into the commitment preimage:
  // h = Poseidon(Poseidon(P) || l || r). This prevents a prover from
  // re-interpreting the committed token array at a shorter prefix.
  const commitment = poseidon([policyHashBigInt, numericTokens.length, chosenRandomizer]);
  const commitmentBigInt = poseidonToBigInt(poseidon, commitment);

  return {
    policyId: config.policy_id ?? config.policyId ?? null,
    datasetId: config.dataset_id ?? config.datasetId ?? null,
    depth,
    numAttributes: PRODUCTION_N,
    numPredicates: PRODUCTION_M,
    numOperations: numericTokens.length,
    tokens: numericTokens,
    policy,
    operators: {
      AND: PRODUCTION_N + PRODUCTION_M + 0,
      OR: PRODUCTION_N + PRODUCTION_M + 1,
      NOT: PRODUCTION_N + PRODUCTION_M + 2
    },
    attributes: {
      order: attributeCtx.order,
      bitmap: attributeCtx.bitmap,
      namespaceByCode: attributeCtx.namespaceByCode,
      requiresPredicateByCode: attributeCtx.requiresPredicateByCode,
      definitions: attributeCtx.definitions
    },
    predicates: {
      slots: predicateCtx.slots,
      namespaceToSlot: Object.fromEntries(predicateCtx.namespaceToSlot.entries()),
      scopeToSlot: Object.fromEntries(predicateCtx.scopeToSlot.entries()),
      scopeParameters: {
        scopeKinds: Array.from({ length: PRODUCTION_M }, (_, slot) => {
          const p = predicateCtx.slots.find((entry) => entry.slot === slot);
          return p && p.kind === 'scoped' ? p.scopeKind : 0;
        }),
        approvedScopeIds: Array.from({ length: PRODUCTION_M }, (_, slot) => {
          const p = predicateCtx.slots.find((entry) => entry.slot === slot);
          return p && p.kind === 'scoped' ? String(p.scopeId) : '0';
        })
      }
    },
    logic: {
      original: config.logic,
      normalized: astToInfix(boundAst),
      rpn: expandedRpn.map((tok) => {
        if (tok.type === 'ATTRIBUTE') return tok.value;
        if (tok.type === 'PREDICATE') return `P[${tok.value}]`;
        if (tok.type === 'OP') return tok.value;
        throw new Error(`Unexpected token type during serialization: ${tok.type}`);
      })
    },
    policyHash: toHex(policyHashBigInt),
    randomizer: toHex(chosenRandomizer),
    policyCommitment: toHex(commitmentBigInt)
  };
}

// CLI wrapper for authoring policies from the terminal.
async function runCli() {
  const argv = process.argv.slice(2);
  const argMap = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        argMap.set(key, true);
      } else {
        argMap.set(key, next);
        i += 1;
      }
    }
  }

  const inputPath = argMap.get('in') ?? argMap.get('input');
  const outputPath = argMap.get('out') ?? argMap.get('output');
  if (!inputPath || !outputPath) {
    console.error('Usage: node compiler/policy_generator.js --in <input.json> --out <output.json> [--depth 20]');
    process.exit(1);
  }

  const depth = argMap.has('depth') ? parseInt(argMap.get('depth'), 10) : 20;
  const randomizerArg = argMap.get('randomizer');

  const absoluteInput = path.resolve(process.cwd(), inputPath);
  const absoluteOutput = path.resolve(process.cwd(), outputPath);

  const raw = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
  const artifacts = await generatePolicyArtifacts(raw, { depth, randomizer: randomizerArg });

  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  const pretty = argMap.has('pretty');
  fs.writeFileSync(absoluteOutput, JSON.stringify(artifacts, null, pretty ? 2 : 0));
  console.log(`✅ Wrote policy artifacts to ${absoluteOutput}`);
  console.log(`   Tokens: ${artifacts.tokens.join(', ')}`);
  console.log(`   Commitment: ${artifacts.policyCommitment}`);
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(`Policy generator failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  generatePolicyArtifacts
};
