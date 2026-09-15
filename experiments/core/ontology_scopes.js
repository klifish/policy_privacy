'use strict';
/**
 * Ontology scope libraries for the policy generator.
 *
 * Each scope is a family of real ontology terms; a policy's whitelist is a
 * random subset of one scope (size from whitelistBuckets, up to 32), so every
 * scope carries at least 32 terms. Sources, retrieved 2026-09-15:
 *
 *  - ICD-10: WHO ICD-10 three-character categories of each chapter (2019 release).
 *  - OBI: EBI OLS4 (https://www.ebi.ac.uk/ols4), subtrees of 'study design'
 *    (OBI:0500000) and 'investigation' (OBI:0000066). OBI has no single term
 *    per classical epidemiological design, so scopes are overlapping design
 *    families; every ID below was resolved against OLS4.
 *  - HANCESTRO: EBI OLS4, each ancestry group (HANCESTRO:0005/0010/0008/0014/0013)
 *    plus its descendants with a HANCESTRO prefix, in ID order.
 *  - ISO 3166-1 alpha-2 codes grouped by UN M49 region (Oceania has only 29
 *    entities, so a 32-term request there yields 29 leaves).
 *  - SNOMED CT: International Edition 20250201 via the public HL7 FHIR
 *    terminology server (tx.fhir.org), active descendants of the named parent
 *    concept; 'Palliative care' (6 descendants) and emergency care (no
 *    procedure subtree) cannot supply 32 terms and were replaced by
 *    rehabilitation and counseling.
 *
 * The `value` numbers are internal enum ids, not ontology ids.
 */

const ICD10_CHAPTERS = Object.freeze({
  INFECTIOUS: 0,      // A00-B99
  NEOPLASMS: 1,       // C00-D48
  BLOOD: 2,           // D50-D89
  ENDOCRINE: 3,       // E00-E90
  MENTAL: 4,          // F01-F99
  NERVOUS: 5,         // G00-G99
  CIRCULATORY: 6,     // I00-I99
  RESPIRATORY: 7,     // J00-J99
  DIGESTIVE: 8,       // K00-K93
  MUSCULOSKELETAL: 9, // M00-M99
});

const OBI_RESEARCH_TYPES = Object.freeze({
  CLINICAL_TRIAL: 0,      // OBI:0003699 Clinical trials and interventional designs
  OBSERVATIONAL: 1,       // OBI:0003693 Observational and comparative designs
  EXPERIMENTAL_DESIGN: 2, // OBI:0000115 Controlled experimental designs
  MOLECULAR_PROFILING: 3, // OBI:0001430 Molecular profiling and assay designs
  MODEL_SYSTEM: 4,        // OBI:0001285 Model-system and mechanistic designs
});

const HANCESTRO_GROUPS = Object.freeze({
  EUROPEAN: 0,            // HANCESTRO:0005 European ancestry
  AFRICAN: 1,             // HANCESTRO:0010 African ancestry
  ASIAN: 2,               // HANCESTRO:0008 Asian ancestry
  LATIN_AMERICAN: 3,      // HANCESTRO:0014 Latin or Admixed American ancestry
  INDIGENOUS_AMERICAN: 4, // HANCESTRO:0013 Indigenous American ancestry
});

const ISO3166_REGIONS = Object.freeze({
  NORTH_AMERICA: 0,   // 41 entities
  EUROPE: 1,          // 51 entities
  ASIA: 2,            // 51 entities
  OCEANIA: 3,         // 29 entities
  AFRICA: 4,          // 59 entities
});

const SNOMED_TERMS = Object.freeze({
  DIAGNOSTIC: 0,      // SCTID 386053000 Diagnostic evaluation procedures
  THERAPEUTIC: 1,     // SCTID 277132007 Therapeutic procedures
  PREVENTIVE: 2,      // SCTID 169443000 Preventive procedures
  REHABILITATION: 3,  // SCTID 52052004 Rehabilitation therapy
  COUNSELING: 4,      // SCTID 409063005 Counseling services
});

const ICD10_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'INFECTIOUS',
    value: ICD10_CHAPTERS.INFECTIOUS,
    level: 'chapter',
    codeRange: 'A00-B99',
    label: 'Certain infectious and parasitic diseases',
    whitelistTerms: [
      'A00', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A08', 'A09', 'A15', 'A16', 'A17',
      'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A27', 'A30', 'A32', 'A33', 'A35', 'A36',
      'A37', 'A38', 'A39', 'A40', 'A41', 'A46', 'A48', 'A49', 'A50', 'A51', 'A52', 'A53',
      'A54', 'A56', 'A59', 'A60', 'A63', 'A64', 'A69', 'A71', 'A75', 'A77', 'A78', 'A80',
      'A81', 'A82', 'A83', 'A84', 'A86', 'A87', 'A90', 'A91', 'A92', 'A95', 'A96', 'A98',
      'B00', 'B01', 'B02', 'B05', 'B06', 'B07', 'B08', 'B15', 'B16', 'B17', 'B18', 'B19',
      'B20', 'B25', 'B26', 'B27', 'B30', 'B33', 'B34', 'B35', 'B36', 'B37', 'B38', 'B39',
      'B40', 'B44', 'B45', 'B50', 'B51', 'B52', 'B53', 'B54', 'B55', 'B56', 'B57', 'B58',
      'B59', 'B60', 'B65', 'B66', 'B67', 'B68', 'B69', 'B70', 'B72', 'B73', 'B74', 'B75',
      'B76', 'B77', 'B78', 'B79', 'B80', 'B81', 'B83', 'B85', 'B86', 'B87', 'B88', 'B89',
      'B90', 'B91', 'B92', 'B94', 'B95', 'B96', 'B97', 'B99',
    ]
  },
  {
    id: 'NEOPLASMS',
    value: ICD10_CHAPTERS.NEOPLASMS,
    level: 'chapter',
    codeRange: 'C00-D48',
    label: 'Neoplasms',
    whitelistTerms: [
      'C00', 'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11',
      'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C23',
      'C24', 'C25', 'C26', 'C30', 'C31', 'C32', 'C33', 'C34', 'C37', 'C38', 'C39', 'C40',
      'C41', 'C43', 'C44', 'C45', 'C46', 'C47', 'C48', 'C49', 'C50', 'C51', 'C52', 'C53',
      'C54', 'C55', 'C56', 'C57', 'C58', 'C60', 'C61', 'C62', 'C63', 'C64', 'C65', 'C66',
      'C67', 'C68', 'C69', 'C70', 'C71', 'C72', 'C73', 'C74', 'C75', 'C76', 'C77', 'C78',
      'C79', 'C80', 'C81', 'C82', 'C83', 'C84', 'C85', 'C88', 'C90', 'C91', 'C92', 'C93',
      'C94', 'C95', 'C96', 'C97', 'D00', 'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07',
      'D09', 'D10', 'D11', 'D12', 'D13', 'D14', 'D15', 'D16', 'D17', 'D18', 'D21', 'D22',
      'D23', 'D24', 'D25', 'D26', 'D27', 'D28', 'D29', 'D30', 'D31', 'D32', 'D33', 'D34',
      'D35', 'D36', 'D37', 'D38', 'D39', 'D40', 'D41', 'D42', 'D43', 'D44', 'D45', 'D46',
      'D47', 'D48',
    ]
  },
  {
    id: 'BLOOD',
    value: ICD10_CHAPTERS.BLOOD,
    level: 'chapter',
    codeRange: 'D50-D89',
    label: 'Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism',
    whitelistTerms: [
      'D50', 'D51', 'D52', 'D53', 'D55', 'D56', 'D57', 'D58', 'D59', 'D60', 'D61', 'D62',
      'D63', 'D64', 'D65', 'D66', 'D67', 'D68', 'D69', 'D70', 'D71', 'D72', 'D73', 'D74',
      'D75', 'D76', 'D77', 'D80', 'D81', 'D82', 'D83', 'D84', 'D86', 'D89',
    ]
  },
  {
    id: 'ENDOCRINE',
    value: ICD10_CHAPTERS.ENDOCRINE,
    level: 'chapter',
    codeRange: 'E00-E90',
    label: 'Endocrine, nutritional and metabolic diseases',
    whitelistTerms: [
      'E00', 'E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E10', 'E11', 'E12', 'E13',
      'E14', 'E15', 'E16', 'E20', 'E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E28',
      'E29', 'E30', 'E31', 'E32', 'E34', 'E35', 'E40', 'E41', 'E42', 'E43', 'E44', 'E45',
      'E46', 'E50', 'E51', 'E52', 'E53', 'E54', 'E55', 'E56', 'E58', 'E59', 'E60', 'E61',
      'E63', 'E64', 'E65', 'E66', 'E67', 'E68', 'E70', 'E71', 'E72', 'E73', 'E74', 'E75',
      'E76', 'E77', 'E78', 'E79', 'E80', 'E83', 'E84', 'E85', 'E86', 'E87', 'E88', 'E89',
      'E90',
    ]
  },
  {
    id: 'MENTAL',
    value: ICD10_CHAPTERS.MENTAL,
    level: 'chapter',
    codeRange: 'F01-F99',
    label: 'Mental and behavioural disorders',
    whitelistTerms: [
      'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F09', 'F10', 'F11', 'F12', 'F13',
      'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24', 'F25',
      'F28', 'F29', 'F30', 'F31', 'F32', 'F33', 'F34', 'F38', 'F39', 'F40', 'F41', 'F42',
      'F43', 'F44', 'F45', 'F48', 'F50', 'F51', 'F52', 'F53', 'F54', 'F55', 'F59', 'F60',
      'F61', 'F62', 'F63', 'F64', 'F65', 'F66', 'F68', 'F69', 'F70', 'F71', 'F72', 'F73',
      'F78', 'F79', 'F80', 'F81', 'F82', 'F83', 'F84', 'F88', 'F89', 'F90', 'F91', 'F92',
      'F93', 'F94', 'F95', 'F98', 'F99',
    ]
  },
  {
    id: 'NERVOUS',
    value: ICD10_CHAPTERS.NERVOUS,
    level: 'chapter',
    codeRange: 'G00-G99',
    label: 'Diseases of the nervous system',
    whitelistTerms: [
      'G00', 'G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11',
      'G12', 'G13', 'G20', 'G21', 'G22', 'G23', 'G24', 'G25', 'G26', 'G30', 'G31', 'G32',
      'G35', 'G36', 'G37', 'G40', 'G41', 'G43', 'G44', 'G45', 'G46', 'G47', 'G50', 'G51',
      'G52', 'G53', 'G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G60', 'G61', 'G62', 'G63',
      'G64', 'G70', 'G71', 'G72', 'G73', 'G80', 'G81', 'G82', 'G83', 'G90', 'G91', 'G92',
      'G93', 'G94', 'G95', 'G96', 'G97', 'G98', 'G99',
    ]
  },
  {
    id: 'CIRCULATORY',
    value: ICD10_CHAPTERS.CIRCULATORY,
    level: 'chapter',
    codeRange: 'I00-I99',
    label: 'Diseases of the circulatory system',
    whitelistTerms: [
      'I00', 'I01', 'I02', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I11', 'I12', 'I13',
      'I15', 'I20', 'I21', 'I22', 'I23', 'I24', 'I25', 'I26', 'I27', 'I28', 'I30', 'I31',
      'I32', 'I33', 'I34', 'I35', 'I36', 'I37', 'I38', 'I39', 'I40', 'I41', 'I42', 'I43',
      'I44', 'I45', 'I46', 'I47', 'I48', 'I49', 'I50', 'I51', 'I52', 'I60', 'I61', 'I62',
      'I63', 'I64', 'I65', 'I66', 'I67', 'I68', 'I69', 'I70', 'I71', 'I72', 'I73', 'I74',
      'I77', 'I78', 'I79', 'I80', 'I81', 'I82', 'I83', 'I84', 'I85', 'I86', 'I87', 'I88',
      'I89', 'I95', 'I97', 'I98', 'I99',
    ]
  },
  {
    id: 'RESPIRATORY',
    value: ICD10_CHAPTERS.RESPIRATORY,
    level: 'chapter',
    codeRange: 'J00-J99',
    label: 'Diseases of the respiratory system',
    whitelistTerms: [
      'J00', 'J01', 'J02', 'J03', 'J04', 'J05', 'J06', 'J09', 'J10', 'J11', 'J12', 'J13',
      'J14', 'J15', 'J16', 'J17', 'J18', 'J20', 'J21', 'J22', 'J30', 'J31', 'J32', 'J33',
      'J34', 'J35', 'J36', 'J37', 'J38', 'J39', 'J40', 'J41', 'J42', 'J43', 'J44', 'J45',
      'J46', 'J47', 'J60', 'J61', 'J62', 'J63', 'J64', 'J65', 'J66', 'J67', 'J68', 'J69',
      'J70', 'J80', 'J81', 'J82', 'J84', 'J85', 'J86', 'J90', 'J91', 'J92', 'J93', 'J94',
      'J95', 'J96', 'J98', 'J99',
    ]
  },
  {
    id: 'DIGESTIVE',
    value: ICD10_CHAPTERS.DIGESTIVE,
    level: 'chapter',
    codeRange: 'K00-K93',
    label: 'Diseases of the digestive system',
    whitelistTerms: [
      'K00', 'K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K07', 'K08', 'K09', 'K10', 'K11',
      'K12', 'K13', 'K14', 'K20', 'K21', 'K22', 'K23', 'K25', 'K26', 'K27', 'K28', 'K29',
      'K30', 'K31', 'K35', 'K36', 'K37', 'K38', 'K40', 'K41', 'K42', 'K43', 'K44', 'K45',
      'K46', 'K50', 'K51', 'K52', 'K55', 'K56', 'K57', 'K58', 'K59', 'K60', 'K61', 'K62',
      'K63', 'K65', 'K66', 'K67', 'K70', 'K71', 'K72', 'K73', 'K74', 'K75', 'K76', 'K77',
      'K80', 'K81', 'K82', 'K83', 'K85', 'K86', 'K87', 'K90', 'K91', 'K92', 'K93',
    ]
  },
  {
    id: 'MUSCULOSKELETAL',
    value: ICD10_CHAPTERS.MUSCULOSKELETAL,
    level: 'chapter',
    codeRange: 'M00-M99',
    label: 'Diseases of the musculoskeletal system and connective tissue',
    whitelistTerms: [
      'M00', 'M01', 'M02', 'M03', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12',
      'M13', 'M14', 'M15', 'M16', 'M17', 'M18', 'M19', 'M20', 'M21', 'M22', 'M23', 'M24',
      'M25', 'M30', 'M31', 'M32', 'M33', 'M34', 'M35', 'M36', 'M40', 'M41', 'M42', 'M43',
      'M45', 'M46', 'M47', 'M48', 'M49', 'M50', 'M51', 'M53', 'M54', 'M60', 'M61', 'M62',
      'M63', 'M65', 'M66', 'M67', 'M68', 'M70', 'M71', 'M72', 'M73', 'M75', 'M76', 'M77',
      'M79', 'M80', 'M81', 'M82', 'M83', 'M84', 'M85', 'M86', 'M87', 'M88', 'M89', 'M90',
      'M91', 'M92', 'M93', 'M94', 'M95', 'M96', 'M99',
    ]
  }
]);

const OBI_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'CLINICAL_TRIAL',
    value: OBI_RESEARCH_TYPES.CLINICAL_TRIAL,
    label: 'Clinical trials and interventional designs',
    termId: 'OBI:0003699',
    whitelistTerms: [
      'OBI:0003699', // clinical trial
      'OBI:0004001', // randomized clinical trial
      'OBI:0004002', // non-randomized clinical trial
      'OBI:0003700', // phase I clinical trial
      'OBI:0003701', // phase II clinical trial
      'OBI:0003702', // phase III clinical trial
      'OBI:0003697', // clinical investigation
      'OBI:0000355', // hypothesis-driven investigation
      'OBI:0500001', // clinical study design
      'OBI:0000115', // intervention design
      'OBI:0500003', // cross over design
      'OBI:0500006', // parallel group design
      'OBI:0500004', // n-to-1 design
      'OBI:0500005', // matched pairs design
      'OBI:0500007', // randomized complete block design
      'OBI:0500008', // balanced incomplete block design
      'OBI:0500014', // factorial design
      'OBI:0500015', // 2x2 factorial design
      'OBI:0500016', // fractional factorial design
      'OBI:0500002', // repeated measure design
      'OBI:0300310', // sequential design
      'OBI:0500020', // time series design
      'OBI:0001418', // dose response design
      'OBI:0000951', // compound treatment design
      'OBI:0003658', // ring trial design
      'OBI:0500018', // replicate design
      'OBI:0500011', // latin square design
      'OBI:0500012', // graeco latin square design
      'OBI:0500013', // hyper graeco latin square design
      'OBI:0500009', // loop design
      'OBI:0500010', // reference design
      'OBI:0001440', // all pairs design
      'OBI:0001401', // protocol optimization design
      'OBI:0001336', // quality control testing design
    ]
  },
  {
    id: 'OBSERVATIONAL',
    value: OBI_RESEARCH_TYPES.OBSERVATIONAL,
    label: 'Observational and comparative designs',
    termId: 'OBI:0003693',
    whitelistTerms: [
      'OBI:0003693', // observational investigation
      'OBI:0003698', // observational clinical investigation
      'OBI:0003692', // case-control investigation
      'OBI:0003695', // nested case-control investigation
      'OBI:0003694', // longitudinal investigation
      'OBI:0002897', // surveillance process
      'OBI:0000356', // hypothesis generating investigation
      'OBI:0300311', // observation design
      'OBI:0002624', // case-control study design
      'OBI:0002614', // birth cohort study design
      'OBI:0002674', // case series design
      'OBI:0002945', // population based design
      'OBI:0002615', // disease specific study design
      'OBI:0001337', // clinical history design
      'OBI:0001329', // family history design
      'OBI:0001226', // environmental history design
      'OBI:0001293', // disease state design
      'OBI:0001426', // sex comparison design
      'OBI:0001377', // organism status comparison design
      'OBI:0001448', // individual genetic characteristics comparison design
      'OBI:0001958', // systematic review study design
      'OBI:0001965', // decision analysis study design
      'OBI:0500020', // time series design
      'OBI:0500002', // repeated measure design
      'OBI:0300310', // sequential design
      'OBI:0001310', // species comparison design
      'OBI:0001464', // strain comparison design
      'OBI:0001328', // organism development design
      'OBI:0001411', // cell type comparison design
      'OBI:0001422', // organism part comparison design
      'OBI:0001205', // cell component comparison design
      'OBI:0001202', // innate behavior design
    ]
  },
  {
    id: 'EXPERIMENTAL_DESIGN',
    value: OBI_RESEARCH_TYPES.EXPERIMENTAL_DESIGN,
    label: 'Controlled experimental designs',
    termId: 'OBI:0000115',
    whitelistTerms: [
      'OBI:0000115', // intervention design
      'OBI:0500003', // cross over design
      'OBI:0500006', // parallel group design
      'OBI:0500004', // n-to-1 design
      'OBI:0500005', // matched pairs design
      'OBI:0500007', // randomized complete block design
      'OBI:0500008', // balanced incomplete block design
      'OBI:0500009', // loop design
      'OBI:0500010', // reference design
      'OBI:0500011', // latin square design
      'OBI:0500012', // graeco latin square design
      'OBI:0500013', // hyper graeco latin square design
      'OBI:0500014', // factorial design
      'OBI:0500015', // 2x2 factorial design
      'OBI:0500016', // fractional factorial design
      'OBI:0500017', // dye swap design
      'OBI:0500018', // replicate design
      'OBI:0500019', // self vs self design
      'OBI:0500020', // time series design
      'OBI:0500002', // repeated measure design
      'OBI:0300310', // sequential design
      'OBI:0001440', // all pairs design
      'OBI:0001418', // dose response design
      'OBI:0000951', // compound treatment design
      'OBI:0000985', // growth condition intervention design
      'OBI:0001401', // protocol optimization design
      'OBI:0001336', // quality control testing design
      'OBI:0001214', // normalization testing design
      'OBI:0001195', // operator variation design
      'OBI:0001252', // array platform variation design
      'OBI:0001957', // hardware testing design
      'OBI:0003658', // ring trial design
      'OBI:0001460', // genetic modification design
    ]
  },
  {
    id: 'MOLECULAR_PROFILING',
    value: OBI_RESEARCH_TYPES.MOLECULAR_PROFILING,
    label: 'Molecular profiling and assay designs',
    termId: 'OBI:0001430',
    whitelistTerms: [
      'OBI:0001430', // transcription profiling design
      'OBI:0001290', // transcription profiling by array design
      'OBI:0001239', // transcription profiling by high throughput sequencing design
      'OBI:0001427', // transcription profiling by tiling array design
      'OBI:0001313', // transcription profiling by RT-PCR design
      'OBI:0001258', // ChIP-seq design
      'OBI:0001403', // ChIP-chip design
      'OBI:0001417', // ChIP-chip by tiling array design
      'OBI:0001278', // DNA methylation profiling by array design
      'OBI:0001435', // DNA methylation profiling by high throughput sequencing design
      'OBI:0001323', // microRNA profiling by array design
      'OBI:0001286', // RNAi profiling by array design
      'OBI:0001441', // proteomic profiling by array design
      'OBI:0002446', // proteomic profiling design
      'OBI:0001410', // translation profiling design
      'OBI:0001444', // genotyping design
      'OBI:0001387', // genotyping by array design
      'OBI:0001200', // genotyping by high throughput sequencing design
      'OBI:0001197', // comparative genome hybridization by array design
      'OBI:0001162', // validation by reverse transcription PCR design
      'OBI:0001166', // validation by real time PCR design
      'OBI:0001425', // protein binding site identification design
      'OBI:0001432', // operon identification design
      'OBI:0002590', // molecular interaction identification design
      'OBI:0002591', // colocalization identification design
      'OBI:0002592', // genetic interaction identification design
      'OBI:0002593', // functional association identification design
      'OBI:0002594', // direct interaction identification design
      'OBI:0002595', // enzymatic reaction identification design
      'OBI:0002596', // self interaction identification design
      'OBI:0500017', // dye swap design
      'OBI:0001252', // array platform variation design
      'OBI:0001214', // normalization testing design
    ]
  },
  {
    id: 'MODEL_SYSTEM',
    value: OBI_RESEARCH_TYPES.MODEL_SYSTEM,
    label: 'Model-system and mechanistic designs',
    termId: 'OBI:0001285',
    whitelistTerms: [
      'OBI:0001285', // in vitro design
      'OBI:0001199', // in vivo design
      'OBI:0001211', // ex vivo design
      'OBI:0003291', // in silico design
      'OBI:0003696', // animal investigation
      'OBI:0001460', // genetic modification design
      'OBI:0001374', // injury design
      'OBI:0001396', // stimulus or stress design
      'OBI:0001454', // pathogenicity design
      'OBI:0001328', // organism development design
      'OBI:0001409', // cell cycle design
      'OBI:0001429', // cell differentiation design
      'OBI:0001365', // cellular process design
      'OBI:0001408', // imprinting design
      'OBI:0001306', // RNA stability design
      'OBI:0001358', // post-transcriptional modification design
      'OBI:0001259', // translational bias design
      'OBI:0001202', // innate behavior design
      'OBI:0000985', // growth condition intervention design
      'OBI:0000951', // compound treatment design
      'OBI:0001418', // dose response design
      'OBI:0001310', // species comparison design
      'OBI:0001464', // strain comparison design
      'OBI:0001411', // cell type comparison design
      'OBI:0001205', // cell component comparison design
      'OBI:0001422', // organism part comparison design
      'OBI:0001426', // sex comparison design
      'OBI:0001448', // individual genetic characteristics comparison design
      'OBI:0001377', // organism status comparison design
      'OBI:0001293', // disease state design
      'OBI:0002590', // molecular interaction identification design
      'OBI:0002592', // genetic interaction identification design
      'OBI:0001432', // operon identification design
      'OBI:0001425', // protein binding site identification design
    ]
  }
]);

const HANCESTRO_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'EUROPEAN',
    value: HANCESTRO_GROUPS.EUROPEAN,
    label: 'European ancestry',
    termId: 'HANCESTRO:0005',
    whitelistTerms: [
      'HANCESTRO:0005', // European ancestry
      'HANCESTRO:0307', // Italian
      'HANCESTRO:0309', // Sardinian
      'HANCESTRO:0310', // Val Borbera
      'HANCESTRO:0311', // Friuli Venezia Giulia
      'HANCESTRO:0312', // Carlantino
      'HANCESTRO:0313', // Old Order Amish
      'HANCESTRO:0314', // Sorb
      'HANCESTRO:0315', // Hutterite
      'HANCESTRO:0316', // Amish
      'HANCESTRO:0317', // Erasmus Rucphen
      'HANCESTRO:0318', // Orcadian
      'HANCESTRO:0319', // Korčulan
      'HANCESTRO:0320', // Dutch
      'HANCESTRO:0321', // Finnish
      'HANCESTRO:0322', // Finnish founder
      'HANCESTRO:0323', // Dutch founder
      'HANCESTRO:0354', // Canadian
      'HANCESTRO:0369', // Icelandic
      'HANCESTRO:0383', // Irish
      'HANCESTRO:0392', // Spanish
      'HANCESTRO:0462', // British
      'HANCESTRO:0551', // genetically homogenous Irish
      'HANCESTRO:0556', // Cilento
      'HANCESTRO:0558', // French Canadian founder
      'HANCESTRO:0559', // Italian founder
      'HANCESTRO:0560', // Northern Finnish founder
      'HANCESTRO:0563', // South Tyrolean
      'HANCESTRO:0569', // Talana
      'HANCESTRO:0590', // European American
      'HANCESTRO:0757', // Adygei in Caucasus, Russia (HGDP)
      'HANCESTRO:0758', // Basque in France (HGDP)
      'HANCESTRO:0759', // Bergamo Italian in Bergamo, Italy (HGDP)
      'HANCESTRO:0760', // French in France (HGDP)
      'HANCESTRO:0761', // Orcadian in Orkney (HGDP)
      'HANCESTRO:0762', // Russian in Russia (HGDP)
      'HANCESTRO:0763', // Sardinian in Italy (HGDP)
      'HANCESTRO:0764', // Tuscan in Italy (HGDP)
      'HANCESTRO:0765', // British in England and Scotland (1KGP)
      'HANCESTRO:0766', // Utah residents (CEPH) with Northern and Western European ancestry  (1KGP)
    ]
  },
  {
    id: 'AFRICAN',
    value: HANCESTRO_GROUPS.AFRICAN,
    label: 'African ancestry',
    termId: 'HANCESTRO:0010',
    whitelistTerms: [
      'HANCESTRO:0010', // African ancestry
      'HANCESTRO:0011', // Sub-Saharan African
      'HANCESTRO:0535', // Gambian
      'HANCESTRO:0633', // Bantu in Kenya (HGDP)
      'HANCESTRO:0634', // Bantu in South Africa (HGDP)
      'HANCESTRO:0635', // Biaka in Central African Republic (HGDP)
      'HANCESTRO:0636', // Mandenka in Senegal (HGDP)
      'HANCESTRO:0637', // Mbuti in Democratic Republic of Congo (HGDP)
      'HANCESTRO:0638', // San in Namibia (HGDP)
      'HANCESTRO:0639', // Yoruba in Nigeria (HGDP)
      'HANCESTRO:0640', // Bantu Herero in Botswana Or Namibia (SGDP)
      'HANCESTRO:0641', // Bantu Kenya in Kenya (SGDP)
      'HANCESTRO:0642', // Bantu Tswana in Botswana Or Namibia (SGDP)
      'HANCESTRO:0643', // Biaka in Central African Republic (SGDP)
      'HANCESTRO:0644', // Dinka in Sudan (SGDP)
      'HANCESTRO:0645', // Esan in Nigeria (SGDP)
      'HANCESTRO:0646', // Gambian in Gambia (SGDP)
      'HANCESTRO:0647', // Ju|'hoan North in Namibia (SGDP)
      'HANCESTRO:0648', // Khomani San in South Africa (SGDP)
      'HANCESTRO:0649', // Luhya in Kenya (SGDP)
      'HANCESTRO:0650', // Luo in Kenya (SGDP)
      'HANCESTRO:0651', // Mandenka in Senegal (SGDP)
      'HANCESTRO:0652', // Masai in Kenya (SGDP)
      'HANCESTRO:0653', // Mbuti in Congo (SGDP)
      'HANCESTRO:0654', // Mende in Sierra Leone (SGDP)
      'HANCESTRO:0655', // Mozabite in Algeria (SGDP)
      'HANCESTRO:0656', // Saharawi in Western Sahara (Morocco) (SGDP)
      'HANCESTRO:0657', // Somali in Kenya (SGDP)
      'HANCESTRO:0658', // Yoruba in Nigeria (SGDP)
      'HANCESTRO:0659', // African Ancestry in Southwest US (1KGP)
      'HANCESTRO:0660', // African Caribbean in Barbados (1KGP)
      'HANCESTRO:0661', // Esan in Nigeria (1KGP)
      'HANCESTRO:0662', // Gambian in Western Division, The Gambia - Fula (GGVP)
      'HANCESTRO:0663', // Gambian in Western Division, The Gambia - Jola (GGVP)
      'HANCESTRO:0664', // Gambian in Western Division, The Gambia - Mandinka (GGVP)
      'HANCESTRO:0665', // Gambian in Western Division, The Gambia - Wolof (GGVP)
      'HANCESTRO:0666', // Luhya in Webuye, Kenya (1KGP)
      'HANCESTRO:0667', // Mende in Sierra Leone (1KGP)
      'HANCESTRO:0668', // Yoruba in Ibadan, Nigeria  (1KGP)
      'HANCESTRO:2000', // African (AFR) reference superpopulation (1KGP)
    ]
  },
  {
    id: 'ASIAN',
    value: HANCESTRO_GROUPS.ASIAN,
    label: 'Asian ancestry',
    termId: 'HANCESTRO:0008',
    whitelistTerms: [
      'HANCESTRO:0008', // Asian ancestry
      'HANCESTRO:0006', // South Asian ancestry
      'HANCESTRO:0007', // South East Asian ancestry
      'HANCESTRO:0009', // East Asian ancestry
      'HANCESTRO:0019', // Japanese
      'HANCESTRO:0020', // Taiwanese
      'HANCESTRO:0021', // Chinese
      'HANCESTRO:0022', // Korean
      'HANCESTRO:0023', // Mongolian
      'HANCESTRO:0024', // Macanese
      'HANCESTRO:0025', // Singaporean Chinese
      'HANCESTRO:0026', // Hong Kong Chinese
      'HANCESTRO:0027', // Han Chinese
      'HANCESTRO:0286', // Central Asian ancestry
      'HANCESTRO:0485', // Bangladeshi
      'HANCESTRO:0487', // Indian
      'HANCESTRO:0489', // Nepalese
      'HANCESTRO:0490', // Pakistani
      'HANCESTRO:0491', // Sri Lankan
      'HANCESTRO:0494', // Indonesian
      'HANCESTRO:0496', // Malaysian
      'HANCESTRO:0498', // Filipino
      'HANCESTRO:0500', // Thai
      'HANCESTRO:0502', // Vietnamese
      'HANCESTRO:0554', // Silk Road founder
      'HANCESTRO:0577', // Dai
      'HANCESTRO:0578', // Hui
      'HANCESTRO:0579', // Jingpo Chinese
      'HANCESTRO:0580', // Malaysian Chinese
      'HANCESTRO:0581', // Uygur
      'HANCESTRO:0582', // Tibetan
      'HANCESTRO:0583', // Taiwanese Han
      'HANCESTRO:0584', // Sri Lankan Sinhalese
      'HANCESTRO:0589', // Punjabi Sikh
      'HANCESTRO:0597', // Singaporean Malay
      'HANCESTRO:0598', // Singaporean Indian
      'HANCESTRO:0698', // Mongola in China (SGDP)
      'HANCESTRO:0703', // Balochi in Pakistan (HGDP)
      'HANCESTRO:0704', // Brahui in Pakistan (HGDP)
      'HANCESTRO:0705', // Burusho in Pakistan (HGDP)
    ]
  },
  {
    id: 'LATIN_AMERICAN',
    value: HANCESTRO_GROUPS.LATIN_AMERICAN,
    label: 'Latin or Admixed American ancestry',
    termId: 'HANCESTRO:0014',
    whitelistTerms: [
      'HANCESTRO:0014', // Latin or Admixed American ancestry
      'HANCESTRO:0352', // Brazilian
      'HANCESTRO:0356', // Chilean
      'HANCESTRO:0403', // Colombian
      'HANCESTRO:0404', // Costa Rican
      'HANCESTRO:0405', // Cuban
      'HANCESTRO:0406', // Dominican
      'HANCESTRO:0415', // Mexican
      'HANCESTRO:0420', // Peruvian
      'HANCESTRO:0421', // Puerto Rican
      'HANCESTRO:0429', // Uruguayan
      'HANCESTRO:0557', // Costa Rican founder
      'HANCESTRO:0669', // Colombian in Colombia (HGDP)
      'HANCESTRO:0670', // Karitiana in Brazil (HGDP)
      'HANCESTRO:0671', // Maya in Mexico (HGDP)
      'HANCESTRO:0672', // Pima in Mexico (HGDP)
      'HANCESTRO:0673', // Surui in Brazil (HGDP)
      'HANCESTRO:0674', // Chane in Argentina (SGDP)
      'HANCESTRO:0675', // Karitiana in Brazil (SGDP)
      'HANCESTRO:0676', // Mayan in Mexico (SGDP)
      'HANCESTRO:0677', // Mixe in Mexico (SGDP)
      'HANCESTRO:0678', // Mixtec in Mexico (SGDP)
      'HANCESTRO:0679', // Piapoco in Colombia (SGDP)
      'HANCESTRO:0680', // Pima in Mexico (SGDP)
      'HANCESTRO:0681', // Quechua in Peru (SGDP)
      'HANCESTRO:0682', // Surui in Brazil (SGDP)
      'HANCESTRO:0683', // Zapotec in Mexico (SGDP)
      'HANCESTRO:0684', // Colombian in Medellin, Colombia (1KGP)
      'HANCESTRO:0685', // Mexican Ancestry in Los Angeles, California (1KGP)
      'HANCESTRO:0686', // Peruvian in Lima, Peru (1KGP)
      'HANCESTRO:0687', // Puerto Rican in Puerto Rico (1KGP)
      'HANCESTRO:2001', // American (AMR) reference superpopulation (1KGP)
      'HANCESTRO:2006', // American reference superpopulation (HGDP)
      'HANCESTRO:2013', // American reference superpopulation (SGDP)
    ]
  },
  {
    id: 'INDIGENOUS_AMERICAN',
    value: HANCESTRO_GROUPS.INDIGENOUS_AMERICAN,
    label: 'Indigenous American ancestry',
    termId: 'HANCESTRO:0013',
    whitelistTerms: [
      'HANCESTRO:0013', // Indigenous American ancestry
      'HANCESTRO:0570', // Akimel O'odham
      'HANCESTRO:0571', // Plains Indians
      'HANCESTRO:0610', // Indigenous in North America
      'HANCESTRO:0611', // Indigenous in South America
      'HANCESTRO:0613', // Otomi
      'HANCESTRO:0614', // Maya
      'HANCESTRO:0615', // Zapoteco
      'HANCESTRO:0616', // Mazateco
      'HANCESTRO:0617', // Rarámuri
      'HANCESTRO:0618', // Nahua
      'HANCESTRO:0619', // Mixteco
      'HANCESTRO:0620', // Wayúu
      'HANCESTRO:0621', // Piapoco
      'HANCESTRO:0622', // Pastos
      'HANCESTRO:0623', // Quechua
      'HANCESTRO:0624', // Aymara
      'HANCESTRO:0625', // Diaguita
      'HANCESTRO:0626', // Mapuche
      'HANCESTRO:0627', // Guaraní
      'HANCESTRO:0628', // Tupiniquim
      'HANCESTRO:0630', // Arhuaco
      'HANCESTRO:0631', // Asháninka
      'HANCESTRO:0670', // Karitiana in Brazil (HGDP)
      'HANCESTRO:0671', // Maya in Mexico (HGDP)
      'HANCESTRO:0672', // Pima in Mexico (HGDP)
      'HANCESTRO:0673', // Surui in Brazil (HGDP)
      'HANCESTRO:0674', // Chane in Argentina (SGDP)
      'HANCESTRO:0675', // Karitiana in Brazil (SGDP)
      'HANCESTRO:0676', // Mayan in Mexico (SGDP)
      'HANCESTRO:0677', // Mixe in Mexico (SGDP)
      'HANCESTRO:0678', // Mixtec in Mexico (SGDP)
      'HANCESTRO:0679', // Piapoco in Colombia (SGDP)
      'HANCESTRO:0680', // Pima in Mexico (SGDP)
      'HANCESTRO:0681', // Quechua in Peru (SGDP)
      'HANCESTRO:0682', // Surui in Brazil (SGDP)
      'HANCESTRO:0683', // Zapotec in Mexico (SGDP)
      'HANCESTRO:0853', // Chane
      'HANCESTRO:0854', // Karitiana
      'HANCESTRO:0855', // Mixe
    ]
  }
]);

const ISO3166_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'NORTH_AMERICA',
    value: ISO3166_REGIONS.NORTH_AMERICA,
    label: 'Northern America, Central America and the Caribbean',
    whitelistTerms: [
      'US', 'CA', 'MX', 'GL', 'BM', 'PM', 'BZ', 'CR', 'SV', 'GT', 'HN', 'NI', 'PA', 'AG', 'BS', 'BB',
      'CU', 'DM', 'DO', 'GD', 'HT', 'JM', 'KN', 'LC', 'VC', 'TT', 'PR', 'VI', 'VG', 'KY', 'TC', 'AW',
      'CW', 'SX', 'BQ', 'AI', 'MS', 'GP', 'MQ', 'BL', 'MF',
    ]
  },
  {
    id: 'EUROPE',
    value: ISO3166_REGIONS.EUROPE,
    label: 'Europe',
    whitelistTerms: [
      'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
      'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT',
      'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA', 'FO', 'GI', 'GG', 'IM',
      'JE', 'AX', 'SJ',
    ]
  },
  {
    id: 'ASIA',
    value: ISO3166_REGIONS.ASIA,
    label: 'Asia',
    whitelistTerms: [
      'AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'CY', 'GE', 'HK', 'IN', 'ID', 'IR', 'IQ',
      'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MO', 'MY', 'MV', 'MN', 'MM', 'NP', 'KP', 'OM',
      'PK', 'PS', 'PH', 'QA', 'SA', 'SG', 'KR', 'LK', 'SY', 'TW', 'TJ', 'TH', 'TL', 'TR', 'TM', 'AE',
      'UZ', 'VN', 'YE',
    ]
  },
  {
    id: 'OCEANIA',
    value: ISO3166_REGIONS.OCEANIA,
    label: 'Oceania',
    whitelistTerms: [
      'AU', 'NZ', 'PG', 'FJ', 'SB', 'VU', 'WS', 'TO', 'KI', 'FM', 'MH', 'PW', 'NR', 'TV', 'NC', 'PF',
      'GU', 'MP', 'AS', 'CK', 'NU', 'TK', 'WF', 'PN', 'NF', 'CX', 'CC', 'HM', 'UM',
    ]
  },
  {
    id: 'AFRICA',
    value: ISO3166_REGIONS.AFRICA,
    label: 'Africa',
    whitelistTerms: [
      'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG',
      'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML',
      'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD',
      'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW', 'EH', 'RE', 'YT', 'SH', 'IO',
    ]
  }
]);

const SNOMED_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'DIAGNOSTIC',
    value: SNOMED_TERMS.DIAGNOSTIC,
    label: 'Diagnostic evaluation procedures',
    parentConceptId: '386053000',
    whitelistTerms: [
      'SNOMED:8611000', // 2,3-diphosphoglycerate measurement, erythrocytes
      'SNOMED:2507007', // 5' Nucleotidase measurement
      'SNOMED:674004', // Abduction test
      'SNOMED:11138003', // Acid mucopolysaccharides measurement
      'SNOMED:6656003', // Acoustic stimulation test
      'SNOMED:6943008', // Aldosterone measurement, normal salt diet, urine
      'SNOMED:5021008', // Aldosterone measurement, standing, normal salt diet
      'SNOMED:8244002', // Alkaline phosphatase isoenzymes measurement
      'SNOMED:8424005', // Alpha-fucosidase measurement, leukocytes
      'SNOMED:1550000', // Amikacin measurement
      'SNOMED:5586008', // Aminolevulinic acid dehydratase measurement
      'SNOMED:5422005', // Amylase measurement, peritoneal fluid
      'SNOMED:11846000', // Aniline measurement
      'SNOMED:10688003', // Anodic stripping voltammetry measurement
      'SNOMED:11343000', // Anoscopy with biopsy
      'SNOMED:1358008', // Anti-human globulin test, enzyme technique, titer
      'SNOMED:4007002', // Anti-human globulin test, indirect, titer, non-gamma
      'SNOMED:3527003', // Antibody measurement
      'SNOMED:540006', // Antibody to single and double stranded DNA measurement
      'SNOMED:6614002', // Antibody to single stranded DNA measurement
      'SNOMED:8706007', // Arginine tolerance test
      'SNOMED:135007', // Arthrotomy of wrist joint with exploration and biopsy
      'SNOMED:5651003', // Arylsulfatase A measurement
      'SNOMED:11610007', // Arylsulfatase A measurement, fibroblasts
      'SNOMED:1759002', // Assessment of nutritional status
      'SNOMED:4447001', // Autopsy, gross and microscopic examination, stillborn or newborn without CNS
      'SNOMED:2054004', // Barbiturates measurement, quantitative and qualitative
      'SNOMED:574005', // Benzodiazepine measurement
      'SNOMED:8642005', // Beryllium measurement
      'SNOMED:10820006', // Beta lactamase measurement
      'SNOMED:6319002', // Beta lactamase, chromogenic cephalosporin susceptibility test
      'SNOMED:9777005', // Bile pigment measurement, urine
      'SNOMED:10812009', // Blood gases, capillary measurement
      'SNOMED:3998005', // Bone imaging of limited area
      'SNOMED:7421004', // Bone marrow imaging, limited area
      'SNOMED:7993000', // Bone marrow imaging, whole body
      'SNOMED:7375006', // Bronchoscopy through tracheostomy with biopsy of bronchus
      'SNOMED:2373006', // Buffy coat smear evaluation
      'SNOMED:11561008', // C1q receptor measurement
      'SNOMED:6880001', // C3e receptor measurement
    ]
  },
  {
    id: 'THERAPEUTIC',
    value: SNOMED_TERMS.THERAPEUTIC,
    label: 'Therapeutic procedures',
    parentConceptId: '277132007',
    whitelistTerms: [
      'SNOMED:243123002', // Ablative hormone therapy
      'SNOMED:231111004', // Acupuncture-like transcutaneous electrical nerve stimulation
      'SNOMED:169406002', // Administration of radiosensitizing drug
      'SNOMED:182764009', // Anticoagulant therapy
      'SNOMED:46589004', // Anticonvulsant therapy
      'SNOMED:174027003', // Barium enema for radiological reduction of intussusception of ileum
      'SNOMED:231110003', // Burst transcutaneous electrical nerve stimulation
      'SNOMED:22733003', // Chemotherapy for non-malignant neoplasm
      'SNOMED:68619000', // Chemotherapy for non-neoplastic disease
      'SNOMED:231112006', // Conventional transcutaneous electrical nerve stimulation
      'SNOMED:170762008', // Conversion to insulin
      'SNOMED:84501003', // Cytokine therapy
      'SNOMED:67716003', // Epidural injection of anesthetic substance, therapeutic, caudal, continuous
      'SNOMED:58611004', // Epidural injection of anesthetic substance, therapeutic, lumbar, continuous
      'SNOMED:103746007', // Heparin therapy
      'SNOMED:182933001', // Hormone replacement therapy ongoing treatment
      'SNOMED:169413002', // Hormone therapy
      'SNOMED:18302006', // Hysterotomy and termination of pregnancy
      'SNOMED:52660002', // Induced termination of pregnancy following intra-amniotic injection with hysterotomy
      'SNOMED:38216008', // Infusion chemotherapy for malignant neoplasm
      'SNOMED:7249009', // Initial drug therapy for mental disorder
      'SNOMED:47188007', // Injection of anesthetic substance, therapeutic, subarachnoid, continuous
      'SNOMED:20381001', // Injection of anesthetic substance, therapeutic, subarachnoid, differential
      'SNOMED:82776005', // Injection of anesthetic substance, therapeutic, subdural, continuous
      'SNOMED:74527005', // Injection of anesthetic substance, therapeutic, subdural, differential
      'SNOMED:66260009', // Injection of prophylactic substance
      'SNOMED:225302006', // Insulin regime
      'SNOMED:243087001', // Interdental cleaning education
      'SNOMED:229558009', // Interferential therapy
      'SNOMED:237019005', // Internal iliac artery vasopressin infusion
      'SNOMED:180240004', // Intramuscular calcitonin therapy
      'SNOMED:180242007', // Intramuscular gold therapy
      'SNOMED:180223008', // Intravenous immunotherapy
      'SNOMED:91480001', // Iontophoresis procedure
      'SNOMED:68852009', // Lithium therapy
      'SNOMED:77738002', // Local chemotherapy for malignant neoplasm
      'SNOMED:231062004', // Lumbar puncture to lower intracranial pressure
      'SNOMED:6657007', // Maintenance drug therapy for mental disorder
      'SNOMED:243089003', // Maxillofacial prosthesis or appliance care education
      'SNOMED:151159008', // Nicotine replacement therapy
    ]
  },
  {
    id: 'PREVENTIVE',
    value: SNOMED_TERMS.PREVENTIVE,
    label: 'Preventive procedures',
    parentConceptId: '169443000',
    whitelistTerms: [
      'SNOMED:134185000', // Accident prevention
      'SNOMED:275843000', // Administration of prophylactic antibiotic for icteric leptospirosis
      'SNOMED:268502007', // Administration of prophylactic antibiotic for leptospirosis
      'SNOMED:170450005', // Administration of prophylactic antibiotic for meningococcus
      'SNOMED:170447007', // Administration of prophylactic antihelminth
      'SNOMED:312452009', // Administration of prophylactic aspirin
      'SNOMED:275931000', // Administration of prophylactic aspirin for ischemic heart disease
      'SNOMED:182929008', // Administration of prophylactic drug or medicament
      'SNOMED:182943003', // Administration of prophylactic iodine for iodine deficiency goiter
      'SNOMED:182935008', // Administration of prophylactic iron
      'SNOMED:182947002', // Administration of prophylactic iron during pregnancy
      'SNOMED:300041008', // Administration of prophylactic penicillin
      'SNOMED:266716006', // Administration of prophylactic salicylate
      'SNOMED:266715005', // Administration of prophylactic steroid
      'SNOMED:275933002', // Administration of prophylactic vitamin
      'SNOMED:275922000', // Administration of prophylactic vitamin and iron during pregnancy
      'SNOMED:182948007', // Administration of prophylactic vitamin during pregnancy
      'SNOMED:23197000', // Air culture for fungus
      'SNOMED:313042009', // Application of dental fluoride varnish
      'SNOMED:30381006', // Bleeding precautions
      'SNOMED:64040008', // Blood and body fluid laboratory precaution procedure
      'SNOMED:65011002', // Blood and fluids precautions
      'SNOMED:243090007', // Bridge or pontic hygiene care education
      'SNOMED:46526008', // Chart review, verification of procedures
      'SNOMED:310221001', // Chemical inactivation of non-adherent skin contaminant
      'SNOMED:225368008', // Contact tracing
      'SNOMED:170512001', // Control of bedbugs
      'SNOMED:170510009', // Control of flies
      'SNOMED:170511008', // Control of mosquitoes
      'SNOMED:170513006', // Control of rodents
      'SNOMED:170509004', // Control of vectors
      'SNOMED:61771005', // Culture of biological indicator
      'SNOMED:39986004', // Culture of blood bank product
      'SNOMED:31619003', // Culture of dialysis fluid
      'SNOMED:82215001', // Culture of environmental surface
      'SNOMED:70977009', // Culture of medical device
      'SNOMED:68071007', // Dental fluoride treatment
      'SNOMED:50271000', // Dental implant maintenance procedure
      'SNOMED:2115003', // Dental prophylaxis of child
      'SNOMED:309056006', // Denture care education
    ]
  },
  {
    id: 'REHABILITATION',
    value: SNOMED_TERMS.REHABILITATION,
    label: 'Rehabilitation therapy',
    parentConceptId: '52052004',
    whitelistTerms: [
      'SNOMED:228531005', // Activity for ontogenetic motor pattern
      'SNOMED:35637008', // Alcohol rehabilitation
      'SNOMED:20093000', // Alcohol rehabilitation and detoxification
      'SNOMED:5391008', // Artificial voice rehabilitation
      'SNOMED:228550005', // Attention training
      'SNOMED:67533008', // Auditory rehabilitation
      'SNOMED:30856002', // Back disease and deformity rehabilitation
      'SNOMED:2457001', // Blind rehabilitation therapy
      'SNOMED:49763002', // Cardiovascular rehabilitation procedure
      'SNOMED:68250009', // Cerebral palsy rehabilitation
      'SNOMED:81790005', // Class in walking training, amputee
      'SNOMED:88695002', // Class in walking training, nervous system
      'SNOMED:62213004', // Combined alcohol and drug rehabilitation
      'SNOMED:23915005', // Combined alcohol and drug rehabilitation and detoxification
      'SNOMED:228548002', // Concept formation training
      'SNOMED:23739009', // Congenital spinal cord disease rehabilitation
      'SNOMED:228534002', // Developmental therapy
      'SNOMED:229171001', // Direction changing training
      'SNOMED:183357003', // Domestic responsibility rehabilitation
      'SNOMED:183356007', // Domestic task rehabilitation
      'SNOMED:78092008', // Drug rehabilitation
      'SNOMED:56876005', // Drug rehabilitation and detoxification
      'SNOMED:183339004', // Educational rehabilitation
      'SNOMED:47279007', // Flail extremity rehabilitation
      'SNOMED:39609006', // Gait evaluation
      'SNOMED:229221008', // Group trust experience games
      'SNOMED:47387005', // Head injury rehabilitation
      'SNOMED:229176006', // Hopping training
      'SNOMED:228644005', // Industrial therapy
      'SNOMED:229166008', // Jogging training
      'SNOMED:42505005', // Joint disease rehabilitation
      'SNOMED:7334004', // Kinetic activities for coordination
      'SNOMED:1121002', // Kinetic activities for range of motion
      'SNOMED:61502001', // Kinetic activities for strengthening
      'SNOMED:17395000', // Language therapy
      'SNOMED:183281008', // Lip-reading training
      'SNOMED:183295006', // Locomotor training
      'SNOMED:26342005', // Medical evaluation for speech, language and/or hearing problems
      'SNOMED:228551009', // Memory retraining
      'SNOMED:229216005', // Minor group games for therapy
    ]
  },
  {
    id: 'COUNSELING',
    value: SNOMED_TERMS.COUNSELING,
    label: 'Counseling services',
    parentConceptId: '409063005',
    whitelistTerms: [
      'SNOMED:243069004', // Abuse counseling
      'SNOMED:413473000', // Alcohol consumption counseling
      'SNOMED:24165007', // Alcoholism counseling
      'SNOMED:410272009', // Anatomy/physiology education, guidance, and counseling
      'SNOMED:313087008', // Anxiety counseling
      'SNOMED:410273004', // Behavior modification education, guidance, and counseling
      'SNOMED:171001002', // Benefits counseling
      'SNOMED:171007003', // Bereavement counseling
      'SNOMED:410274005', // Bladder care education, guidance, and counseling
      'SNOMED:410275006', // Bonding education, guidance, and counseling
      'SNOMED:410276007', // Bowel care education, guidance, and counseling
      'SNOMED:243068007', // Bullying counseling
      'SNOMED:410278008', // Cardiac care education, guidance, and counseling
      'SNOMED:410280002', // Cast care education, guidance, and counseling
      'SNOMED:225421002', // Change in body image counseling
      'SNOMED:410281003', // Communication education, guidance, and counseling
      'SNOMED:422649009', // Community outreach worker services education, guidance, and counseling
      'SNOMED:410282005', // Coping skills education, guidance, and counseling
      'SNOMED:243067002', // Coping strategy counseling
      'SNOMED:310358004', // Counseling about serious diagnosis
      'SNOMED:105393000', // Counseling by chaplain
      'SNOMED:66800001', // Counseling by physiotherapist
      'SNOMED:313070006', // Counseling for domestic abuse
      'SNOMED:171008008', // Counseling for loss of limb
      'SNOMED:10383002', // Counseling for termination of pregnancy
      'SNOMED:171003004', // Counseling of employer
      'SNOMED:313073008', // Crime victim counseling
      'SNOMED:410283000', // Day care/respite education, guidance, and counseling
      'SNOMED:410284006', // Discipline education, guidance, and counseling
      'SNOMED:46964002', // Diversional therapy
      'SNOMED:410285007', // Dressing change/wound care education, guidance, and counseling
      'SNOMED:60112009', // Drug addiction counseling
      'SNOMED:410286008', // Durable medical equipment education, guidance, and counseling
      'SNOMED:313076000', // Eating disorder counseling
      'SNOMED:409065003', // Education programs education, guidance and counseling
      'SNOMED:410287004', // Employment education, guidance, and counseling
      'SNOMED:410288009', // Environment education, guidance, and counseling
      'SNOMED:410289001', // Exercises education, guidance, and counseling
      'SNOMED:311764000', // Family counseling
      'SNOMED:410290005', // Family planning education, guidance, and counseling
    ]
  }
]);

module.exports = {
  ICD10_CHAPTERS,
  OBI_RESEARCH_TYPES,
  HANCESTRO_GROUPS,
  ISO3166_REGIONS,
  SNOMED_TERMS,
  ICD10_SCOPE_LIBRARY,
  OBI_SCOPE_LIBRARY,
  HANCESTRO_SCOPE_LIBRARY,
  ISO3166_SCOPE_LIBRARY,
  SNOMED_SCOPE_LIBRARY
};
