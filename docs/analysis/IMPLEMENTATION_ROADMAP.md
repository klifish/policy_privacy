# 实现路线图：隐私保护同意管理系统扩展

## 概述

本文档提供了扩展当前 `policy_privacy` 系统的具体实现指导，包含可执行的代码示例、详细的开发步骤和集成方案。

## 立即可实现的功能扩展

### 1. 动态同意管理模块

#### 1.1 创建同意状态管理智能合约

**文件路径**: `contracts/ConsentManager.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./CommitmentPlonkVerifier.sol";

contract ConsentManager {
    struct ConsentRecord {
        bytes32 consentId;
        address patient;
        bytes32 policyCommitment;
        uint256 grantedAt;
        uint256 expiresAt;
        ConsentStatus status;
        bytes32 zkProofHash;
        string metadataUri;
    }
    
    enum ConsentStatus {
        Active,
        Revoked,
        Expired,
        Modified,
        Suspended
    }
    
    // 存储结构
    mapping(bytes32 => ConsentRecord) public consents;
    mapping(address => bytes32[]) public patientConsents;
    mapping(bytes32 => bytes32[]) public consentHistory; // 原始ID -> 历史版本IDs
    
    // 访问控制
    mapping(address => bool) public authorizedProviders;
    mapping(address => bool) public authorizedAuditors;
    
    // 事件定义
    event ConsentGranted(bytes32 indexed consentId, address indexed patient, bytes32 policyCommitment);
    event ConsentRevoked(bytes32 indexed consentId, address indexed patient, uint256 timestamp);
    event ConsentModified(bytes32 indexed oldConsentId, bytes32 indexed newConsentId, address indexed patient);
    event ConsentExpired(bytes32 indexed consentId, address indexed patient);
    
    modifier onlyPatientOrAuthorized(bytes32 consentId) {
        ConsentRecord memory consent = consents[consentId];
        require(
            msg.sender == consent.patient || 
            authorizedProviders[msg.sender] || 
            authorizedAuditors[msg.sender], 
            "Unauthorized access"
        );
        _;
    }
    
    modifier onlyActiveConsent(bytes32 consentId) {
        require(consents[consentId].status == ConsentStatus.Active, "Consent not active");
        require(block.timestamp < consents[consentId].expiresAt, "Consent expired");
        _;
    }
    
    function grantConsent(
        bytes32 consentId,
        bytes32 policyCommitment,
        uint256 duration,
        bytes32 zkProofHash,
        string calldata metadataUri
    ) external {
        require(consents[consentId].patient == address(0), "Consent already exists");
        
        consents[consentId] = ConsentRecord({
            consentId: consentId,
            patient: msg.sender,
            policyCommitment: policyCommitment,
            grantedAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            status: ConsentStatus.Active,
            zkProofHash: zkProofHash,
            metadataUri: metadataUri
        });
        
        patientConsents[msg.sender].push(consentId);
        
        emit ConsentGranted(consentId, msg.sender, policyCommitment);
    }
    
    function revokeConsent(bytes32 consentId) external {
        require(consents[consentId].patient == msg.sender, "Only patient can revoke");
        require(consents[consentId].status == ConsentStatus.Active, "Consent not active");
        
        consents[consentId].status = ConsentStatus.Revoked;
        
        emit ConsentRevoked(consentId, msg.sender, block.timestamp);
    }
    
    function modifyConsent(
        bytes32 oldConsentId,
        bytes32 newConsentId,
        bytes32 newPolicyCommitment,
        uint256 newDuration,
        bytes32 newZkProofHash,
        string calldata newMetadataUri
    ) external {
        require(consents[oldConsentId].patient == msg.sender, "Only patient can modify");
        require(consents[oldConsentId].status == ConsentStatus.Active, "Original consent not active");
        require(consents[newConsentId].patient == address(0), "New consent ID already exists");
        
        // 标记旧同意为已修改
        consents[oldConsentId].status = ConsentStatus.Modified;
        
        // 创建新同意记录
        consents[newConsentId] = ConsentRecord({
            consentId: newConsentId,
            patient: msg.sender,
            policyCommitment: newPolicyCommitment,
            grantedAt: block.timestamp,
            expiresAt: block.timestamp + newDuration,
            status: ConsentStatus.Active,
            zkProofHash: newZkProofHash,
            metadataUri: newMetadataUri
        });
        
        // 更新历史记录
        consentHistory[oldConsentId].push(newConsentId);
        patientConsents[msg.sender].push(newConsentId);
        
        emit ConsentModified(oldConsentId, newConsentId, msg.sender);
    }
    
    function checkConsentValid(bytes32 consentId) external view returns (bool) {
        ConsentRecord memory consent = consents[consentId];
        return consent.status == ConsentStatus.Active && 
               block.timestamp < consent.expiresAt;
    }
    
    function getConsentHistory(bytes32 originalConsentId) external view returns (bytes32[] memory) {
        return consentHistory[originalConsentId];
    }
    
    // 管理员功能
    function authorizeProvider(address provider) external {
        // 实际实现中需要访问控制
        authorizedProviders[provider] = true;
    }
    
    function expireConsent(bytes32 consentId) external {
        require(block.timestamp >= consents[consentId].expiresAt, "Not yet expired");
        consents[consentId].status = ConsentStatus.Expired;
        emit ConsentExpired(consentId, consents[consentId].patient);
    }
}
```

#### 1.2 同意管理器测试

**文件路径**: `test/contracts/ConsentManager.test.js`

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConsentManager", function() {
  let consentManager;
  let owner, patient, provider, auditor;
  
  beforeEach(async function() {
    [owner, patient, provider, auditor] = await ethers.getSigners();
    
    const ConsentManager = await ethers.getContractFactory("ConsentManager");
    consentManager = await ConsentManager.deploy();
    await consentManager.waitForDeployment();
  });
  
  describe("同意授予", function() {
    it("患者应该能够授予同意", async function() {
      const consentId = ethers.id("consent1");
      const policyCommitment = ethers.id("policy1");
      const duration = 86400; // 1天
      const zkProofHash = ethers.id("proof1");
      const metadataUri = "ipfs://QmTest123";
      
      await expect(
        consentManager.connect(patient).grantConsent(
          consentId,
          policyCommitment,
          duration,
          zkProofHash,
          metadataUri
        )
      ).to.emit(consentManager, "ConsentGranted")
       .withArgs(consentId, patient.address, policyCommitment);
      
      const consent = await consentManager.consents(consentId);
      expect(consent.patient).to.equal(patient.address);
      expect(consent.status).to.equal(0); // Active
    });
    
    it("不应该允许重复的同意ID", async function() {
      const consentId = ethers.id("consent1");
      const policyCommitment = ethers.id("policy1");
      const duration = 86400;
      const zkProofHash = ethers.id("proof1");
      const metadataUri = "ipfs://QmTest123";
      
      // 第一次授予
      await consentManager.connect(patient).grantConsent(
        consentId, policyCommitment, duration, zkProofHash, metadataUri
      );
      
      // 第二次授予应该失败
      await expect(
        consentManager.connect(patient).grantConsent(
          consentId, policyCommitment, duration, zkProofHash, metadataUri
        )
      ).to.be.revertedWith("Consent already exists");
    });
  });
  
  describe("同意撤回", function() {
    it("患者应该能够撤回自己的同意", async function() {
      const consentId = ethers.id("consent1");
      const policyCommitment = ethers.id("policy1");
      
      // 先授予同意
      await consentManager.connect(patient).grantConsent(
        consentId, policyCommitment, 86400, ethers.id("proof1"), "ipfs://test"
      );
      
      // 撤回同意
      await expect(
        consentManager.connect(patient).revokeConsent(consentId)
      ).to.emit(consentManager, "ConsentRevoked")
       .withArgs(consentId, patient.address, await time.latest() + 1);
      
      const consent = await consentManager.consents(consentId);
      expect(consent.status).to.equal(1); // Revoked
    });
  });
  
  describe("同意修改", function() {
    it("患者应该能够修改现有同意", async function() {
      const oldConsentId = ethers.id("consent1");
      const newConsentId = ethers.id("consent2");
      const oldPolicyCommitment = ethers.id("policy1");
      const newPolicyCommitment = ethers.id("policy2");
      
      // 授予原始同意
      await consentManager.connect(patient).grantConsent(
        oldConsentId, oldPolicyCommitment, 86400, ethers.id("proof1"), "ipfs://old"
      );
      
      // 修改同意
      await expect(
        consentManager.connect(patient).modifyConsent(
          oldConsentId,
          newConsentId,
          newPolicyCommitment,
          172800, // 2天
          ethers.id("proof2"),
          "ipfs://new"
        )
      ).to.emit(consentManager, "ConsentModified")
       .withArgs(oldConsentId, newConsentId, patient.address);
      
      // 检查旧同意状态
      const oldConsent = await consentManager.consents(oldConsentId);
      expect(oldConsent.status).to.equal(3); // Modified
      
      // 检查新同意状态
      const newConsent = await consentManager.consents(newConsentId);
      expect(newConsent.status).to.equal(0); // Active
      expect(newConsent.policyCommitment).to.equal(newPolicyCommitment);
    });
  });
});
```

### 2. 医疗特定同意类型扩展

#### 2.1 医疗同意原子定义

**文件路径**: `compiler/medical_consent_atoms.js`

```javascript
const crypto = require('crypto');
const { poseidon } = require("circomlibjs");

class MedicalConsentAtoms {
    static ATOM_TYPES = {
        RESEARCH_CONSENT: 'RESEARCH_CONSENT',
        TREATMENT_CONSENT: 'TREATMENT_CONSENT', 
        DATA_SHARING_CONSENT: 'DATA_SHARING_CONSENT',
        EMERGENCY_CONSENT: 'EMERGENCY_CONSENT',
        GENETIC_CONSENT: 'GENETIC_CONSENT'
    };
    
    static RESEARCH_CONSENT = {
        type: 'RESEARCH_CONSENT',
        requiredParams: ['study_id', 'research_category', 'data_types', 'retention_period'],
        optionalParams: ['compensation', 'withdrawal_policy'],
        validation: (params) => {
            const required = ['study_id', 'research_category', 'data_types', 'retention_period'];
            const missing = required.filter(param => !params[param]);
            if (missing.length > 0) {
                throw new Error(`Missing required parameters: ${missing.join(', ')}`);
            }
            
            // 验证研究类别
            const validCategories = ['clinical_trial', 'observational', 'genomic', 'behavioral'];
            if (!validCategories.includes(params.research_category)) {
                throw new Error(`Invalid research category: ${params.research_category}`);
            }
            
            // 验证保留期限
            if (params.retention_period <= 0) {
                throw new Error('Retention period must be positive');
            }
            
            return true;
        },
        generateCommitment: (params) => {
            const hash = crypto.createHash('sha256');
            hash.update(JSON.stringify({
                type: 'RESEARCH_CONSENT',
                study_id: params.study_id,
                research_category: params.research_category,
                data_types: params.data_types.sort(), // 确保确定性
                retention_period: params.retention_period
            }));
            return hash.digest('hex');
        }
    };
    
    static TREATMENT_CONSENT = {
        type: 'TREATMENT_CONSENT',
        requiredParams: ['procedure_code', 'risk_level', 'expected_outcome'],
        optionalParams: ['alternative_treatments', 'recovery_time', 'cost_estimate'],
        validation: (params) => {
            const required = ['procedure_code', 'risk_level', 'expected_outcome'];
            const missing = required.filter(param => !params[param]);
            if (missing.length > 0) {
                throw new Error(`Missing required parameters: ${missing.join(', ')}`);
            }
            
            // 验证风险等级
            const validRiskLevels = ['minimal', 'low', 'moderate', 'high', 'very_high'];
            if (!validRiskLevels.includes(params.risk_level)) {
                throw new Error(`Invalid risk level: ${params.risk_level}`);
            }
            
            // 验证程序代码格式（假设使用CPT代码）
            if (!/^\d{5}$/.test(params.procedure_code)) {
                throw new Error('Invalid procedure code format');
            }
            
            return true;
        },
        generateCommitment: (params) => {
            const hash = crypto.createHash('sha256');
            hash.update(JSON.stringify({
                type: 'TREATMENT_CONSENT',
                procedure_code: params.procedure_code,
                risk_level: params.risk_level,
                expected_outcome: params.expected_outcome
            }));
            return hash.digest('hex');
        }
    };
    
    static DATA_SHARING_CONSENT = {
        type: 'DATA_SHARING_CONSENT',
        requiredParams: ['recipient_organization', 'purpose', 'data_categories', 'retention_period'],
        optionalParams: ['geographic_restrictions', 'access_frequency', 'anonymization_level'],
        validation: (params) => {
            const required = ['recipient_organization', 'purpose', 'data_categories', 'retention_period'];
            const missing = required.filter(param => !params[param]);
            if (missing.length > 0) {
                throw new Error(`Missing required parameters: ${missing.join(', ')}`);
            }
            
            // 验证数据类别
            const validCategories = [
                'demographic', 'clinical', 'genetic', 'behavioral', 
                'imaging', 'laboratory', 'medication', 'device_data'
            ];
            const invalidCategories = params.data_categories.filter(
                cat => !validCategories.includes(cat)
            );
            if (invalidCategories.length > 0) {
                throw new Error(`Invalid data categories: ${invalidCategories.join(', ')}`);
            }
            
            return true;
        },
        generateCommitment: (params) => {
            const hash = crypto.createHash('sha256');
            hash.update(JSON.stringify({
                type: 'DATA_SHARING_CONSENT',
                recipient_organization: params.recipient_organization,
                purpose: params.purpose,
                data_categories: params.data_categories.sort(),
                retention_period: params.retention_period
            }));
            return hash.digest('hex');
        }
    };
    
    static EMERGENCY_CONSENT = {
        type: 'EMERGENCY_CONSENT',
        requiredParams: ['emergency_contact', 'authorized_actions', 'validity_period'],
        optionalParams: ['specific_conditions', 'exclusions'],
        validation: (params) => {
            const required = ['emergency_contact', 'authorized_actions', 'validity_period'];
            const missing = required.filter(param => !params[param]);
            if (missing.length > 0) {
                throw new Error(`Missing required parameters: ${missing.join(', ')}`);
            }
            
            // 验证授权行动
            const validActions = [
                'life_saving_treatment', 'diagnostic_procedures', 'medication_administration',
                'surgical_intervention', 'data_access', 'family_notification'
            ];
            const invalidActions = params.authorized_actions.filter(
                action => !validActions.includes(action)
            );
            if (invalidActions.length > 0) {
                throw new Error(`Invalid authorized actions: ${invalidActions.join(', ')}`);
            }
            
            return true;
        },
        generateCommitment: (params) => {
            const hash = crypto.createHash('sha256');
            hash.update(JSON.stringify({
                type: 'EMERGENCY_CONSENT',
                emergency_contact: params.emergency_contact,
                authorized_actions: params.authorized_actions.sort(),
                validity_period: params.validity_period
            }));
            return hash.digest('hex');
        }
    };
    
    // 组合多种同意类型
    static createCompositeConsent(consents) {
        const sortedConsents = consents.sort((a, b) => a.type.localeCompare(b.type));
        const compositeHash = crypto.createHash('sha256');
        compositeHash.update(JSON.stringify(sortedConsents));
        return compositeHash.digest('hex');
    }
    
    // 验证同意组合的兼容性
    static validateConsentCompatibility(consents) {
        // 检查冲突的同意类型
        const types = consents.map(c => c.type);
        
        // 示例：研究同意和治疗同意可能有冲突
        if (types.includes('RESEARCH_CONSENT') && types.includes('TREATMENT_CONSENT')) {
            // 检查研究是否影响治疗
            const researchConsent = consents.find(c => c.type === 'RESEARCH_CONSENT');
            const treatmentConsent = consents.find(c => c.type === 'TREATMENT_CONSENT');
            
            if (researchConsent.params.research_category === 'clinical_trial' &&
                treatmentConsent.params.procedure_code === researchConsent.params.study_procedure) {
                throw new Error('Research and treatment consents may conflict');
            }
        }
        
        return true;
    }
}

module.exports = { MedicalConsentAtoms };
```

#### 2.2 医疗同意编译器

**文件路径**: `compiler/medical_consent_compiler.js`

```javascript
const { MedicalConsentAtoms } = require('./medical_consent_atoms.js');
const fs = require('fs');
const path = require('path');

class MedicalConsentCompiler {
    constructor() {
        this.atomTypes = MedicalConsentAtoms;
    }
    
    // 编译医疗同意政策
    compile(inputPath, outputPath) {
        try {
            const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
            const compiledPolicy = this.compilePolicy(inputData);
            
            fs.writeFileSync(outputPath, JSON.stringify(compiledPolicy, null, 2));
            console.log(`Medical consent policy compiled to: ${outputPath}`);
            
            return compiledPolicy;
        } catch (error) {
            console.error(`Compilation failed: ${error.message}`);
            throw error;
        }
    }
    
    compilePolicy(inputData) {
        const { consents, logicalExpression, metadata = {} } = inputData;
        
        // 验证输入数据
        if (!consents || !Array.isArray(consents)) {
            throw new Error('Missing or invalid consents array');
        }
        
        if (!logicalExpression) {
            throw new Error('Missing logical expression');
        }
        
        // 编译每个同意原子
        const compiledConsents = consents.map((consent, index) => {
            return this.compileConsentAtom(consent, index);
        });
        
        // 验证同意兼容性
        MedicalConsentAtoms.validateConsentCompatibility(consents);
        
        // 解析逻辑表达式
        const rpnTokens = this.parseLogicalExpression(logicalExpression, consents.length);
        
        // 生成政策承诺
        const policyCommitment = this.generatePolicyCommitment(compiledConsents, rpnTokens);
        
        return {
            version: "1.0.0",
            compiledAt: new Date().toISOString(),
            metadata: metadata,
            consents: compiledConsents,
            logicalExpression: logicalExpression,
            rpnTokens: rpnTokens,
            policyCommitment: policyCommitment,
            N: consents.length,
            totalAtoms: consents.length
        };
    }
    
    compileConsentAtom(consentData, index) {
        const { type, params, metadata = {} } = consentData;
        
        // 获取原子类型定义
        const atomDefinition = this.getAtomDefinition(type);
        if (!atomDefinition) {
            throw new Error(`Unknown consent atom type: ${type}`);
        }
        
        // 验证参数
        atomDefinition.validation(params);
        
        // 生成承诺
        const commitment = atomDefinition.generateCommitment(params);
        
        return {
            index: index,
            type: type,
            params: params,
            metadata: metadata,
            commitment: commitment,
            compiledAt: new Date().toISOString()
        };
    }
    
    getAtomDefinition(type) {
        switch(type) {
            case 'RESEARCH_CONSENT':
                return MedicalConsentAtoms.RESEARCH_CONSENT;
            case 'TREATMENT_CONSENT':
                return MedicalConsentAtoms.TREATMENT_CONSENT;
            case 'DATA_SHARING_CONSENT':
                return MedicalConsentAtoms.DATA_SHARING_CONSENT;
            case 'EMERGENCY_CONSENT':
                return MedicalConsentAtoms.EMERGENCY_CONSENT;
            default:
                return null;
        }
    }
    
    parseLogicalExpression(expression, numConsents) {
        // 简化的表达式解析器，支持AND、OR、NOT和括号
        const tokens = this.tokenizeExpression(expression);
        const rpn = this.infixToRPN(tokens, numConsents);
        return rpn;
    }
    
    tokenizeExpression(expression) {
        // 将表达式分解为令牌
        const tokenRegex = /(\w+|\(|\)|AND|OR|NOT)/g;
        const matches = expression.match(tokenRegex);
        
        if (!matches) {
            throw new Error('Invalid expression format');
        }
        
        return matches.map(token => token.trim());
    }
    
    infixToRPN(tokens, numConsents) {
        const precedence = { 'NOT': 3, 'AND': 2, 'OR': 1 };
        const outputQueue = [];
        const operatorStack = [];
        
        // 操作符编码：N+0=AND, N+1=OR, N+2=NOT
        const operatorCodes = {
            'AND': numConsents + 0,
            'OR': numConsents + 1, 
            'NOT': numConsents + 2
        };
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            if (/^C\d+$/.test(token)) {
                // 同意原子（C0, C1, C2...）
                const index = parseInt(token.substring(1));
                if (index >= numConsents) {
                    throw new Error(`Invalid consent index: ${index}`);
                }
                outputQueue.push(index);
            } else if (token in precedence) {
                // 操作符
                while (
                    operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1] !== '(' &&
                    precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
                ) {
                    const op = operatorStack.pop();
                    outputQueue.push(operatorCodes[op]);
                }
                operatorStack.push(token);
            } else if (token === '(') {
                operatorStack.push(token);
            } else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    const op = operatorStack.pop();
                    outputQueue.push(operatorCodes[op]);
                }
                if (operatorStack.length === 0) {
                    throw new Error('Mismatched parentheses');
                }
                operatorStack.pop(); // 移除'('
            }
        }
        
        // 处理剩余操作符
        while (operatorStack.length > 0) {
            const op = operatorStack.pop();
            if (op === '(' || op === ')') {
                throw new Error('Mismatched parentheses');
            }
            outputQueue.push(operatorCodes[op]);
        }
        
        return outputQueue;
    }
    
    generatePolicyCommitment(compiledConsents, rpnTokens) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        
        // 结合所有同意承诺和RPN令牌
        const commitmentData = {
            consents: compiledConsents.map(c => c.commitment),
            rpnTokens: rpnTokens,
            timestamp: Date.now()
        };
        
        hash.update(JSON.stringify(commitmentData));
        return '0x' + hash.digest('hex');
    }
}

// CLI接口
if (require.main === module) {
    const yargs = require('yargs');
    
    yargs
        .command({
            command: 'compile <input> <output>',
            describe: 'Compile medical consent policy',
            builder: (yargs) => {
                return yargs
                    .positional('input', {
                        describe: 'Input JSON file path',
                        type: 'string'
                    })
                    .positional('output', {
                        describe: 'Output JSON file path', 
                        type: 'string'
                    });
            },
            handler: (argv) => {
                const compiler = new MedicalConsentCompiler();
                try {
                    compiler.compile(argv.input, argv.output);
                    console.log('Compilation successful');
                } catch (error) {
                    console.error('Compilation failed:', error.message);
                    process.exit(1);
                }
            }
        })
        .command({
            command: 'validate <file>',
            describe: 'Validate medical consent policy file',
            builder: (yargs) => {
                return yargs
                    .positional('file', {
                        describe: 'Policy file path to validate',
                        type: 'string'
                    });
            },
            handler: (argv) => {
                try {
                    const inputData = JSON.parse(fs.readFileSync(argv.file, 'utf8'));
                    const compiler = new MedicalConsentCompiler();
                    
                    // 验证格式
                    if (!inputData.consents || !inputData.logicalExpression) {
                        throw new Error('Invalid policy format');
                    }
                    
                    // 验证每个同意
                    inputData.consents.forEach((consent, index) => {
                        try {
                            compiler.compileConsentAtom(consent, index);
                            console.log(`✓ Consent ${index} (${consent.type}) is valid`);
                        } catch (error) {
                            console.error(`✗ Consent ${index} is invalid: ${error.message}`);
                            process.exit(1);
                        }
                    });
                    
                    // 验证兼容性
                    MedicalConsentAtoms.validateConsentCompatibility(inputData.consents);
                    
                    console.log('✓ Policy file is valid');
                } catch (error) {
                    console.error('Validation failed:', error.message);
                    process.exit(1);
                }
            }
        })
        .help()
        .argv;
}

module.exports = { MedicalConsentCompiler };
```

### 3. 示例医疗同意政策

#### 3.1 临床试验同意示例

**文件路径**: `examples/clinical_trial_case/consent_policy.input.json`

```json
{
  "metadata": {
    "title": "COVID-19疫苗临床试验同意政策",
    "description": "第三期临床试验参与者综合同意管理",
    "version": "1.0.0",
    "createdBy": "研究伦理委员会",
    "institution": "某某大学医学院"
  },
  "consents": [
    {
      "type": "RESEARCH_CONSENT",
      "params": {
        "study_id": "COVID19-VAX-P3-001",
        "research_category": "clinical_trial",
        "data_types": ["demographic", "clinical", "laboratory", "imaging", "genetic"],
        "retention_period": 2555200,
        "compensation": "交通补贴和时间补偿",
        "withdrawal_policy": "可随时无理由退出"
      },
      "metadata": {
        "description": "COVID-19疫苗临床试验研究同意",
        "riskLevel": "moderate",
        "expectedDuration": "12个月"
      }
    },
    {
      "type": "TREATMENT_CONSENT", 
      "params": {
        "procedure_code": "90746",
        "risk_level": "moderate",
        "expected_outcome": "免疫保护和安全性评估",
        "alternative_treatments": ["现有疫苗", "非药物预防措施"],
        "recovery_time": "接种后观察30分钟",
        "cost_estimate": "免费"
      },
      "metadata": {
        "description": "疫苗接种治疗同意",
        "specialInstructions": "接种后需要观察不良反应"
      }
    },
    {
      "type": "DATA_SHARING_CONSENT",
      "params": {
        "recipient_organization": "国家疫苗安全监测中心",
        "purpose": "疫苗安全性监测和公共卫生决策",
        "data_categories": ["demographic", "clinical", "laboratory"],
        "retention_period": 3153600,
        "geographic_restrictions": ["中国大陆"],
        "anonymization_level": "匿名化处理"
      },
      "metadata": {
        "description": "疫苗安全监测数据共享同意",
        "dataProtectionLevel": "高"
      }
    },
    {
      "type": "EMERGENCY_CONSENT",
      "params": {
        "emergency_contact": "主要研究者和伦理委员会",
        "authorized_actions": ["life_saving_treatment", "family_notification", "data_access"],
        "validity_period": 1576800,
        "specific_conditions": ["严重不良反应", "需要紧急医疗干预"],
        "exclusions": ["非医疗紧急情况"]
      },
      "metadata": {
        "description": "临床试验紧急情况同意",
        "contactInfo": "24小时紧急电话：xxx-xxxx-xxxx"
      }
    }
  ],
  "logicalExpression": "(C0 AND C1) AND (C2 OR C3)",
  "additionalMetadata": {
    "ethicsApprovalNumber": "IRB-2024-001",
    "principalInvestigator": "张教授",
    "studyPhase": "III",
    "expectedEnrollment": 30000,
    "studyLocations": ["北京", "上海", "广州", "深圳"],
    "regulatoryApprovals": ["NMPA临床试验批准", "伦理委员会批准"]
  }
}
```

#### 3.2 编译结果示例

**文件路径**: `examples/clinical_trial_case/consent_policy.compiled.json`

```json
{
  "version": "1.0.0",
  "compiledAt": "2024-01-15T08:30:00.000Z",
  "metadata": {
    "title": "COVID-19疫苗临床试验同意政策",
    "description": "第三期临床试验参与者综合同意管理",
    "version": "1.0.0",
    "createdBy": "研究伦理委员会",
    "institution": "某某大学医学院"
  },
  "consents": [
    {
      "index": 0,
      "type": "RESEARCH_CONSENT",
      "params": {
        "study_id": "COVID19-VAX-P3-001",
        "research_category": "clinical_trial",
        "data_types": ["clinical", "demographic", "genetic", "imaging", "laboratory"],
        "retention_period": 2555200
      },
      "commitment": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
      "compiledAt": "2024-01-15T08:30:00.100Z"
    },
    {
      "index": 1,
      "type": "TREATMENT_CONSENT",
      "params": {
        "procedure_code": "90746",
        "risk_level": "moderate", 
        "expected_outcome": "免疫保护和安全性评估"
      },
      "commitment": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a",
      "compiledAt": "2024-01-15T08:30:00.200Z"
    },
    {
      "index": 2,
      "type": "DATA_SHARING_CONSENT",
      "params": {
        "recipient_organization": "国家疫苗安全监测中心",
        "purpose": "疫苗安全性监测和公共卫生决策",
        "data_categories": ["clinical", "demographic", "laboratory"],
        "retention_period": 3153600
      },
      "commitment": "c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab2",
      "compiledAt": "2024-01-15T08:30:00.300Z"
    },
    {
      "index": 3,
      "type": "EMERGENCY_CONSENT", 
      "params": {
        "emergency_contact": "主要研究者和伦理委员会",
        "authorized_actions": ["data_access", "family_notification", "life_saving_treatment"],
        "validity_period": 1576800
      },
      "commitment": "d4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab2c3",
      "compiledAt": "2024-01-15T08:30:00.400Z"
    }
  ],
  "logicalExpression": "(C0 AND C1) AND (C2 OR C3)",
  "rpnTokens": [0, 1, 4, 2, 3, 5, 4],
  "policyCommitment": "0xe5f6789012345678901234567890abcdef1234567890abcdef1234567ab2c3d4",
  "N": 4,
  "totalAtoms": 4
}
```

## 集成测试与部署

### 1. 完整系统测试

**文件路径**: `test/integration/full_system.test.js`

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MedicalConsentCompiler } = require("../../compiler/medical_consent_compiler.js");
const fs = require('fs');
const path = require('path');

describe("完整医疗同意管理系统测试", function() {
  let consentManager;
  let mockVerifier; 
  let patient, doctor, researcher;
  let compiler;
  
  beforeEach(async function() {
    [patient, doctor, researcher] = await ethers.getSigners();
    
    // 部署合约
    const ConsentManager = await ethers.getContractFactory("ConsentManager");
    consentManager = await ConsentManager.deploy();
    await consentManager.waitForDeployment();
    
    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();
    
    // 初始化编译器
    compiler = new MedicalConsentCompiler();
  });
  
  it("应该能够编译、部署和验证完整的医疗同意流程", async function() {
    // 1. 编译同意政策
    const inputPath = path.join(__dirname, '../../examples/clinical_trial_case/consent_policy.input.json');
    const outputPath = path.join(__dirname, 'temp_compiled_policy.json');
    
    const compiledPolicy = compiler.compile(inputPath, outputPath);
    expect(compiledPolicy).to.have.property('policyCommitment');
    expect(compiledPolicy.N).to.equal(4);
    
    // 2. 在区块链上注册同意
    const consentId = ethers.id("clinical_trial_consent_001");
    const policyCommitment = compiledPolicy.policyCommitment;
    const duration = 365 * 24 * 60 * 60; // 1年
    const zkProofHash = ethers.id("mock_proof_hash");
    const metadataUri = "ipfs://QmClinicalTrialConsent123";
    
    await expect(
      consentManager.connect(patient).grantConsent(
        consentId,
        policyCommitment, 
        duration,
        zkProofHash,
        metadataUri
      )
    ).to.emit(consentManager, "ConsentGranted");
    
    // 3. 验证同意状态
    const isValid = await consentManager.checkConsentValid(consentId);
    expect(isValid).to.be.true;
    
    // 4. 模拟同意修改
    const newConsentId = ethers.id("clinical_trial_consent_002");
    const newPolicyCommitment = ethers.id("new_policy_commitment");
    const newZkProofHash = ethers.id("new_proof_hash");
    const newMetadataUri = "ipfs://QmModifiedConsent456";
    
    await expect(
      consentManager.connect(patient).modifyConsent(
        consentId,
        newConsentId,
        newPolicyCommitment,
        duration,
        newZkProofHash,
        newMetadataUri
      )
    ).to.emit(consentManager, "ConsentModified");
    
    // 5. 验证历史记录
    const history = await consentManager.getConsentHistory(consentId);
    expect(history).to.include(newConsentId);
    
    // 6. 清理临时文件
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });
  
  it("应该能够处理同意撤回和重新授予", async function() {
    // 授予同意
    const consentId = ethers.id("revoke_test_consent");
    const policyCommitment = ethers.id("test_policy");
    
    await consentManager.connect(patient).grantConsent(
      consentId, policyCommitment, 86400, ethers.id("proof"), "ipfs://test"
    );
    
    // 撤回同意
    await consentManager.connect(patient).revokeConsent(consentId);
    
    // 验证同意无效
    const isValid = await consentManager.checkConsentValid(consentId);
    expect(isValid).to.be.false;
    
    // 重新授予同意（使用不同ID）
    const newConsentId = ethers.id("new_consent_after_revoke");
    await expect(
      consentManager.connect(patient).grantConsent(
        newConsentId, policyCommitment, 86400, ethers.id("new_proof"), "ipfs://new"
      )
    ).to.emit(consentManager, "ConsentGranted");
  });
});
```

## 部署脚本

**文件路径**: `scripts/deploy_medical_consent_system.js`

```javascript
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("开始部署医疗同意管理系统...");
  
  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);
  console.log("账户余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));
  
  // 1. 部署验证器合约
  console.log("\n1. 部署PLONK验证器...");
  const PlonkVerifier = await ethers.getContractFactory("CommitmentPlonkVerifier");
  const plonkVerifier = await PlonkVerifier.deploy();
  await plonkVerifier.waitForDeployment();
  console.log("PLONK验证器部署在:", await plonkVerifier.getAddress());
  
  // 2. 部署同意管理合约
  console.log("\n2. 部署同意管理器...");
  const ConsentManager = await ethers.getContractFactory("ConsentManager");
  const consentManager = await ConsentManager.deploy();
  await consentManager.waitForDeployment();
  console.log("同意管理器部署在:", await consentManager.getAddress());
  
  // 3. 部署承诺合约
  console.log("\n3. 部署承诺合约...");
  const testCommitment = ethers.id("test_commitment_hash");
  const Commitment = await ethers.getContractFactory("Commitment");
  const commitment = await Commitment.deploy(
    await plonkVerifier.getAddress(),
    testCommitment
  );
  await commitment.waitForDeployment();
  console.log("承诺合约部署在:", await commitment.getAddress());
  
  // 4. 配置访问权限
  console.log("\n4. 配置访问权限...");
  
  // 授权部署者为提供者（实际部署时应该是医院地址）
  await consentManager.authorizeProvider(deployer.address);
  console.log("已授权部署者为医疗提供者");
  
  // 5. 保存部署信息
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString(),
    contracts: {
      plonkVerifier: {
        address: await plonkVerifier.getAddress(),
        name: "CommitmentPlonkVerifier"
      },
      consentManager: {
        address: await consentManager.getAddress(),
        name: "ConsentManager"
      },
      commitment: {
        address: await commitment.getAddress(),
        name: "Commitment"
      }
    },
    gasUsed: {
      // 这里可以记录实际的gas使用量
    }
  };
  
  const deploymentPath = path.join(__dirname, '../deployments/medical_consent_deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n部署信息已保存到: ${deploymentPath}`);
  
  // 6. 验证合约
  console.log("\n5. 验证合约部署...");
  
  try {
    // 测试同意管理器
    const testConsentId = ethers.id("deployment_test_consent");
    const testPolicyCommitment = ethers.id("test_policy_commitment");
    
    await consentManager.grantConsent(
      testConsentId,
      testPolicyCommitment,
      86400, // 1天
      ethers.id("test_proof"),
      "ipfs://QmTestDeployment"
    );
    
    const isValid = await consentManager.checkConsentValid(testConsentId);
    console.log("✓ 同意管理器测试通过:", isValid);
    
    // 清理测试数据
    await consentManager.revokeConsent(testConsentId);
    console.log("✓ 测试数据已清理");
    
  } catch (error) {
    console.error("✗ 合约验证失败:", error.message);
    process.exit(1);
  }
  
  console.log("\n🎉 医疗同意管理系统部署完成！");
  console.log("\n下一步操作:");
  console.log("1. 使用医疗同意编译器编译同意政策");
  console.log("2. 在前端应用中集成合约地址");
  console.log("3. 配置医疗提供者权限");
  console.log("4. 设置监控和报警");
  
  return deploymentInfo;
}

// 错误处理
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

## 使用指南

### 1. 安装和设置

```bash
# 安装新的依赖
npm install yargs

# 构建电路
npm run build:circuit

# 编译合约
npx hardhat compile
```

### 2. 编译医疗同意政策

```bash
# 编译临床试验同意政策
node compiler/medical_consent_compiler.js compile \
  examples/clinical_trial_case/consent_policy.input.json \
  examples/clinical_trial_case/consent_policy.compiled.json

# 验证政策文件
node compiler/medical_consent_compiler.js validate \
  examples/clinical_trial_case/consent_policy.input.json
```

### 3. 部署系统

```bash
# 本地测试网部署
npx hardhat run scripts/deploy_medical_consent_system.js --network localhost

# 测试网部署
npx hardhat run scripts/deploy_medical_consent_system.js --network sepolia
```

### 4. 运行测试

```bash
# 运行医疗同意编译器测试
npx mocha test/compiler/medical_consent_compiler.test.js

# 运行合约测试  
npx hardhat test test/contracts/ConsentManager.test.js

# 运行集成测试
npx hardhat test test/integration/full_system.test.js
```

这个实现路线图提供了立即可执行的代码和详细的实现步骤。开发者可以按照这个指南逐步扩展现有系统，添加完整的医疗同意管理功能。